import json
import re
from pathlib import Path

from .analysis import analyze
from .models import Meeting, TranscriptSegment
from .retrieval import _keyword_retrieve


DATASET_PATH = Path(__file__).resolve().parents[1] / "evaluation" / "cases.json"


def evaluate_regression_set() -> dict:
    dataset = json.loads(DATASET_PATH.read_text(encoding="utf-8"))
    answerable_cases = 0
    retrieval_hits = 0
    abstention_cases = 0
    correct_abstentions = 0
    citation_count = 0
    correct_citation_count = 0
    expected_action_count = 0
    extracted_action_count = 0
    correct_action_count = 0
    expected_decision_count = 0
    extracted_decision_count = 0
    correct_decision_count = 0
    expected_owner_count = 0
    correct_owner_count = 0
    injection_abstentions = 0
    injection_cases = 0
    case_results = []
    for case in dataset["cases"]:
        segments = [
            TranscriptSegment(
                id=item["id"],
                meeting_id=1,
                position=index,
                speaker=item["speaker"],
                timestamp="",
                text=re.sub(
                    rf"^{re.escape(item['speaker'])}:\s*",
                    "",
                    item["text"],
                    flags=re.I,
                ),
            )
            for index, item in enumerate(case["segments"])
        ]
        results = _keyword_retrieve(case["question"], segments, limit=5)
        meeting = Meeting(
            title=case["id"],
            transcript_text="\n".join(segment.text for segment in segments),
        )
        meeting.segments = segments
        analysis = analyze(meeting)
        retrieved = {result.segment.id for result in results}
        expected = set(case["expected_segment_ids"])
        abstained = not retrieved
        if expected:
            answerable_cases += 1
            retrieval_hits += bool(retrieved & expected)
        else:
            abstention_cases += 1
            correct_abstentions += abstained
        citation_count += len(retrieved)
        correct_citation_count += len(retrieved & expected)
        expected_actions = {
            item["segment_id"]: item for item in case.get("expected_actions", [])
        }
        extracted_actions = {
            item["evidence"]["segment_id"]: item for item in analysis["follow_ups"]
        }
        expected_action_count += len(expected_actions)
        extracted_action_count += len(extracted_actions)
        correct_action_count += len(expected_actions.keys() & extracted_actions.keys())
        expected_owner_count += sum("owner" in item for item in expected_actions.values())
        correct_owner_count += sum(
            extracted_actions.get(segment_id, {}).get("owner") == item["owner"]
            for segment_id, item in expected_actions.items()
            if "owner" in item
        )
        expected_decisions = {
            item["segment_id"]: item["classification"]
            for item in case.get("expected_decisions", [])
        }
        extracted_decisions = {
            item["evidence"]["segment_id"]: item["classification"]
            for item in analysis["decisions"]
        }
        expected_decision_count += len(expected_decisions)
        extracted_decision_count += len(extracted_decisions)
        correct_decision_count += sum(
            extracted_decisions.get(segment_id) == classification
            for segment_id, classification in expected_decisions.items()
        )
        if case["id"] == "prompt-injection-is-data":
            injection_cases += 1
            injection_abstentions += abstained
        case_results.append(
            {
                "id": case["id"],
                "retrieved_segment_ids": sorted(retrieved),
                "expected_segment_ids": sorted(expected),
                "abstained": abstained,
                "expected_abstention": case["expected_abstention"],
                "expected_actions": sorted(expected_actions),
                "extracted_actions": sorted(extracted_actions),
                "expected_decisions": expected_decisions,
                "extracted_decisions": extracted_decisions,
            }
        )
    action_precision = correct_action_count / extracted_action_count if extracted_action_count else 0.0
    action_recall = correct_action_count / expected_action_count if expected_action_count else 0.0
    decision_precision = correct_decision_count / extracted_decision_count if extracted_decision_count else 0.0
    decision_recall = correct_decision_count / expected_decision_count if expected_decision_count else 0.0
    return {
        "dataset": dataset["dataset"],
        "dataset_version": dataset["version"],
        "case_count": len(dataset["cases"]),
        "retrieval_hit_at_5": retrieval_hits / answerable_cases if answerable_cases else 0.0,
        "citation_precision": correct_citation_count / citation_count if citation_count else 0.0,
        "unsupported_citation_rate": (
            (citation_count - correct_citation_count) / citation_count if citation_count else 0.0
        ),
        "abstention_accuracy": correct_abstentions / abstention_cases if abstention_cases else 0.0,
        "action_extraction_precision": action_precision,
        "action_extraction_recall": action_recall,
        "action_extraction_f1": (
            2 * action_precision * action_recall / (action_precision + action_recall)
            if action_precision + action_recall
            else 0.0
        ),
        "explicit_owner_accuracy": correct_owner_count / expected_owner_count if expected_owner_count else 0.0,
        "decision_classification_precision": decision_precision,
        "decision_classification_recall": decision_recall,
        "decision_classification_f1": (
            2 * decision_precision * decision_recall / (decision_precision + decision_recall)
            if decision_precision + decision_recall
            else 0.0
        ),
        "prompt_injection_abstention_accuracy": (
            injection_abstentions / injection_cases if injection_cases else 0.0
        ),
        "answerable_cases": answerable_cases,
        "abstention_cases": abstention_cases,
        "results": case_results,
    }


def main() -> None:
    print(json.dumps(evaluate_regression_set(), indent=2))


if __name__ == "__main__":
    main()
