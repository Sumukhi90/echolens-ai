import asyncio
import json
import os
from typing import TypeVar
from urllib.parse import quote

import httpx
from pydantic import BaseModel, ValidationError


OutputModel = TypeVar("OutputModel", bound=BaseModel)
GEMINI_API_ROOT = "https://generativelanguage.googleapis.com/v1beta/models"


class ProviderUnavailable(RuntimeError):
    pass


class GeminiProvider:
    provider_name = "Gemini"

    def __init__(
        self,
        api_key: str | None = None,
        model: str | None = None,
        *,
        timeout_seconds: float = 25,
        transport: httpx.AsyncBaseTransport | None = None,
    ):
        self._api_key = api_key if api_key is not None else os.getenv("GEMINI_API_KEY", "")
        self.model = model or os.getenv("GEMINI_MODEL", "gemini-2.5-flash")
        self.timeout_seconds = timeout_seconds
        self.transport = transport

    async def generate_structured(
        self,
        system_instruction: str,
        untrusted_input: dict,
        output_model: type[OutputModel],
    ) -> OutputModel:
        if not self._api_key:
            raise ProviderUnavailable("Gemini is not configured.")
        url = f"{GEMINI_API_ROOT}/{quote(self.model, safe='-._')}:generateContent"
        request_body = {
            "systemInstruction": {"parts": [{"text": system_instruction}]},
            "contents": [{"role": "user", "parts": [{"text": json.dumps(untrusted_input)}]}],
            "generationConfig": {
                "responseMimeType": "application/json",
                "responseJsonSchema": output_model.model_json_schema(),
                "temperature": 0.1,
            },
        }
        for attempt in range(2):
            try:
                async with httpx.AsyncClient(
                    timeout=httpx.Timeout(self.timeout_seconds),
                    transport=self.transport,
                ) as client:
                    response = await client.post(
                        url,
                        headers={"x-goog-api-key": self._api_key},
                        json=request_body,
                    )
                if response.status_code in {408, 429} or response.status_code >= 500:
                    if attempt == 0:
                        await asyncio.sleep(0.1)
                        continue
                    raise ProviderUnavailable(
                        f"Gemini returned a retryable HTTP status ({response.status_code})."
                    )
                response.raise_for_status()
                body = response.json()
                text = body["candidates"][0]["content"]["parts"][0]["text"]
                return output_model.model_validate_json(text)
            except (httpx.TimeoutException, httpx.NetworkError) as exc:
                if attempt == 0:
                    await asyncio.sleep(0.1)
                    continue
                raise ProviderUnavailable("Gemini request timed out or could not connect.") from exc
            except (httpx.HTTPStatusError, KeyError, IndexError, TypeError, ValidationError, ValueError) as exc:
                raise ProviderUnavailable("Gemini returned an invalid or unsuccessful response.") from exc
        raise ProviderUnavailable("Gemini request failed after retry.")
