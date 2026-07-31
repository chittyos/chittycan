#!/usr/bin/env python3
"""
ChittyCan OpenAI Parity Test Suite (Python)

Validates drop-in compatibility with OpenAI API.
Tests chat completions, completions, embeddings, and streaming.

Usage:
    export CHITTYCAN_TOKEN=chitty_xxx
    export OPENAI_API_BASE=https://connect.chitty.cc/v1
    python3 tests/parity_py.py

Model names are configurable so the same suite can be pointed at any
OpenAI-compatible endpoint (ChittyCan proxy, Ollama, a local gateway):

    PARITY_CHAT_MODEL        default gpt-4
    PARITY_COMPLETION_MODEL  default text-davinci-003
    PARITY_EMBEDDING_MODEL   default text-embedding-3-small

Assertions are identical for every target. llama3.2:1b answers the greeting
prompt correctly at temperature 0, so no endpoint currently needs a relaxed
content check and none is offered — a knob that weakens a gate should exist
only once something actually requires it.
"""

import os
import sys
import time
import openai
from openai import OpenAI

# Configure. Credentials are checked BEFORE constructing the client: the
# openai>=1.0 constructor raises when no api_key is available, which would make
# the skip below unreachable.
api_base = os.getenv("OPENAI_API_BASE", "https://connect.chitty.cc/v1")
api_key = os.environ.get("CHITTYCAN_TOKEN") or os.environ.get("OPENAI_API_KEY")

if not api_key:
    print("SKIP: CHITTYCAN_TOKEN or OPENAI_API_KEY not set")
    sys.exit(0)

client = OpenAI(api_key=api_key, base_url=api_base)

# `or` rather than a getenv default: an env var set to the empty string (a CI
# `${{ vars.X }}` that is unset expands to "") must fall back, not send model="".
# Node's `||` already behaves this way; this keeps the two harnesses identical.
CHAT_MODEL = os.getenv("PARITY_CHAT_MODEL") or "gpt-4"
COMPLETION_MODEL = os.getenv("PARITY_COMPLETION_MODEL") or "text-davinci-003"
EMBEDDING_MODEL = os.getenv("PARITY_EMBEDDING_MODEL") or "text-embedding-3-small"
print(f"Testing OpenAI compatibility at: {api_base}")
print(f"  chat={CHAT_MODEL}  completion={COMPLETION_MODEL}  embedding={EMBEDDING_MODEL}")
print("=" * 60)


def assert_ok(cond, msg):
    """Assert condition or exit with error"""
    if not cond:
        print(f"FAIL: {msg}")
        sys.exit(2)


def test_chat():
    """Test chat completions"""
    print("\n[1/5] Testing chat completions...")

    r = client.chat.completions.create(
        model=CHAT_MODEL,
        messages=[{"role": "user", "content": "Say hi in 3 words"}],
        max_tokens=16,
        temperature=0
    )

    # Verify response structure
    assert_ok(r.id, "chat missing id")
    assert_ok(r.object, "chat missing object")
    assert_ok(r.choices, "chat missing choices")
    assert_ok(r.usage, "chat missing usage")

    # Verify content
    content = r.choices[0].message.content
    assert_ok(content and len(content) > 0, "chat content empty")
    assert_ok(
        "hi" in content.lower() or "hello" in content.lower(),
        "chat content sanity check",
    )

    # Verify usage tokens
    assert_ok(r.usage.total_tokens > 0, "chat usage tokens missing")

    print("✓ Chat completions OK")


def test_completion():
    """Test text completions"""
    print("\n[2/5] Testing text completions...")

    r = client.completions.create(
        model=COMPLETION_MODEL,
        prompt="2+2 =",
        max_tokens=5,
        temperature=0
    )

    # Verify response structure
    assert_ok(r.choices, "completion missing choices")
    assert_ok(r.usage, "completion missing usage")

    # Verify content
    text = r.choices[0].text
    assert_ok(text and len(text) > 0, "completion text empty")

    print("✓ Text completions OK")


def test_embeddings():
    """Test embeddings"""
    print("\n[3/5] Testing embeddings...")

    r = client.embeddings.create(
        model=EMBEDDING_MODEL,
        input="hello world"
    )

    # Verify response structure
    assert_ok(r.data and len(r.data) > 0, "embedding missing data")
    assert_ok(r.object, "embedding missing object")

    # Verify embedding vector
    embedding = r.data[0].embedding
    assert_ok(len(embedding) > 100, "embedding vector too short")
    assert_ok(isinstance(embedding[0], float), "embedding not float array")

    print("✓ Embeddings OK")


def test_streaming():
    """Test streaming completions"""
    print("\n[4/5] Testing streaming...")

    # Unlike the other calls this one is sampled (Ollama defaults to
    # temperature 0.8), so its duration varies ~4x. max_tokens bounds the worst
    # case; the assertions only need "more than zero chunks with content".
    stream = client.chat.completions.create(
        model=CHAT_MODEL,
        messages=[{"role": "user", "content": "Count to 3"}],
        max_tokens=64,
        stream=True
    )

    chunk_count = 0
    content = ""

    for chunk in stream:
        chunk_count += 1

        # Verify chunk structure
        assert_ok(chunk.choices, "stream chunk missing choices")

        delta = chunk.choices[0].delta
        if delta and delta.content:
            content += delta.content

    assert_ok(chunk_count > 0, "stream no chunks received")
    assert_ok(len(content) > 0, "stream no content received")

    print("✓ Streaming OK")


def test_error_handling():
    """Test error handling"""
    print("\n[5/5] Testing error handling...")

    try:
        client.chat.completions.create(
            model="invalid-model-does-not-exist",
            messages=[{"role": "user", "content": "test"}]
        )
        assert_ok(False, "error handling should have raised exception")
    except openai.OpenAIError as e:
        # Expected error
        assert_ok(True, "error handling raised correctly")

    print("✓ Error handling OK")


def run_all():
    """Run all tests"""
    start_time = time.time()

    test_chat()
    test_completion()
    test_embeddings()
    test_streaming()
    test_error_handling()

    elapsed = time.time() - start_time

    print("\n" + "=" * 60)
    print(f"ALL TESTS PASSED ({elapsed:.2f}s)")
    print("\n✅ ChittyCan proxy is OpenAI-compatible")
    print("\nNext steps:")
    print("  1. Update your code to use new api_base")
    print("  2. Run your existing test suite")
    print("  3. Deploy to staging with new endpoint")


if __name__ == "__main__":
    run_all()
