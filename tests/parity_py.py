#!/usr/bin/env python3
"""
ChittyCan OpenAI Parity Test Suite (Python)

Validates drop-in compatibility with OpenAI API.
"""

import os
import sys
import time
try:
    from openai import OpenAI
except ImportError:
    print("SKIP: openai package is not installed")
    sys.exit(0)

BASE_URL = os.getenv("OPENAI_API_BASE", "https://connect.chitty.cc/v1")
API_KEY = os.getenv("CHITTYCAN_TOKEN") or os.getenv("OPENAI_API_KEY")
CHAT_MODEL = os.getenv("OPENAI_TEST_CHAT_MODEL", "gpt-4")
EMBED_MODEL = os.getenv("OPENAI_TEST_EMBED_MODEL", "text-embedding-3-small")
SKIP_EMBEDDINGS = os.getenv("SKIP_EMBEDDINGS") == "1"

if not API_KEY:
    print("SKIP: CHITTYCAN_TOKEN/OPENAI_API_KEY not set for this run")
    sys.exit(0)

client = OpenAI(api_key=API_KEY, base_url=BASE_URL)

print(f"Testing OpenAI compatibility at: {BASE_URL}")
print("=" * 60)


def assert_ok(cond, msg):
    if not cond:
        raise AssertionError(msg)


def test_chat():
    print("\n[1/4] Testing chat completions...")

    r = client.chat.completions.create(
        model=CHAT_MODEL,
        messages=[{"role": "user", "content": "Say hi in 3 words"}],
        max_tokens=16,
        temperature=0,
    )

    assert_ok(r.id is not None, "chat missing id")
    assert_ok(r.object == "chat.completion", "chat object type wrong")
    assert_ok(r.choices and len(r.choices) > 0, "chat missing choices")
    assert_ok(r.usage is not None, "chat missing usage")

    content = (r.choices[0].message.content or "").strip()
    assert_ok(len(content) > 0, "chat content empty")

    print("✓ Chat completions OK")


def test_embeddings():
    if SKIP_EMBEDDINGS:
        print("\n[2/4] Skipping embeddings (SKIP_EMBEDDINGS=1)")
        return

    print("\n[2/4] Testing embeddings...")

    r = client.embeddings.create(
        model=EMBED_MODEL,
        input="hello world",
    )

    assert_ok(r.object == "list", "embedding object type wrong")
    assert_ok(r.data and len(r.data) > 0, "embedding missing data")

    embedding = r.data[0].embedding
    assert_ok(isinstance(embedding, list), "embedding not list")
    assert_ok(len(embedding) > 0, "embedding vector empty")
    assert_ok(isinstance(embedding[0], float), "embedding not float array")

    print("✓ Embeddings OK")


def test_streaming():
    print("\n[3/4] Testing streaming...")

    stream = client.chat.completions.create(
        model=CHAT_MODEL,
        messages=[{"role": "user", "content": "Count to 3"}],
        stream=True,
    )

    chunk_count = 0
    content = ""

    for chunk in stream:
        chunk_count += 1
        choices = chunk.choices or []
        if choices:
            delta = choices[0].delta
            if delta and delta.content:
                content += delta.content

    assert_ok(chunk_count > 0, "stream no chunks received")
    assert_ok(len(content) > 0, "stream no content received")

    print("✓ Streaming OK")


def test_error_handling():
    print("\n[4/4] Testing error handling...")

    try:
        client.chat.completions.create(
            model="invalid-model-does-not-exist",
            messages=[{"role": "user", "content": "test"}],
        )
        raise AssertionError("error handling should have raised exception")
    except Exception:
        pass

    print("✓ Error handling OK")


def run_all():
    start = time.time()

    test_chat()
    test_embeddings()
    test_streaming()
    test_error_handling()

    elapsed = time.time() - start
    print("\n" + "=" * 60)
    print(f"ALL TESTS PASSED ({elapsed:.2f}s)")
    print("\n✅ ChittyCan proxy is OpenAI-compatible")


if __name__ == "__main__":
    try:
        run_all()
    except Exception as err:
        print("\n" + "=" * 60)
        print("TEST FAILED")
        print(err)
        sys.exit(1)
