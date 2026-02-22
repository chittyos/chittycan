#!/usr/bin/env python3
"""
ChittyCan OpenAI Parity Test Suite (Python)

Validates drop-in compatibility with OpenAI API.
Tests chat completions, completions, embeddings, and streaming.

Usage:
    export CHITTYCAN_TOKEN=chitty_xxx
    export OPENAI_API_BASE=https://connect.chitty.cc/v1
    python3 tests/parity_py.py
"""

import os
import sys
import time
import openai

# Configure
openai.api_base = os.getenv("OPENAI_API_BASE", "https://connect.chitty.cc/v1")
openai.api_key = os.environ.get("CHITTYCAN_TOKEN") or os.environ.get("OPENAI_API_KEY")

if not openai.api_key:
    print("ERROR: Set CHITTYCAN_TOKEN or OPENAI_API_KEY")
    sys.exit(1)

print(f"Testing OpenAI compatibility at: {openai.api_base}")
print("=" * 60)


def assert_ok(cond, msg):
    """Assert condition or exit with error"""
    if not cond:
        print(f"FAIL: {msg}")
        sys.exit(2)


def test_chat():
    """Test chat completions"""
    print("\n[1/5] Testing chat completions...")

    r = openai.ChatCompletion.create(
        model="gpt-4",
        messages=[{"role": "user", "content": "Say hi in 3 words"}],
        max_tokens=16,
        temperature=0
    )

    # Verify response structure
    assert_ok("id" in r, "chat missing id")
    assert_ok("object" in r, "chat missing object")
    assert_ok("choices" in r and r.choices, "chat missing choices")
    assert_ok("usage" in r, "chat missing usage")

    # Verify content
    content = r.choices[0].message.content
    assert_ok(content and len(content) > 0, "chat content empty")
    assert_ok("hi" in content.lower() or "hello" in content.lower(), "chat content sanity check")

    # Verify usage tokens
    assert_ok(r.usage.total_tokens > 0, "chat usage tokens missing")

    print("✓ Chat completions OK")


def test_completion():
    """Test text completions"""
    print("\n[2/5] Testing text completions...")

    r = openai.Completion.create(
        model="text-davinci-003",
        prompt="2+2 =",
        max_tokens=5,
        temperature=0
    )

    # Verify response structure
    assert_ok("choices" in r and r.choices, "completion missing choices")
    assert_ok("usage" in r, "completion missing usage")

    # Verify content
    text = r.choices[0].text
    assert_ok(text and len(text) > 0, "completion text empty")

    print("✓ Text completions OK")


def test_embeddings():
    """Test embeddings"""
    print("\n[3/5] Testing embeddings...")

    r = openai.Embedding.create(
        model="text-embedding-3-small",
        input="hello world"
    )

    # Verify response structure
    assert_ok("data" in r and len(r.data) > 0, "embedding missing data")
    assert_ok("object" in r, "embedding missing object")

    # Verify embedding vector
    embedding = r.data[0].embedding
    assert_ok(len(embedding) > 100, "embedding vector too short")
    assert_ok(isinstance(embedding[0], float), "embedding not float array")

    print("✓ Embeddings OK")


def test_streaming():
    """Test streaming completions"""
    print("\n[4/5] Testing streaming...")

    stream = openai.ChatCompletion.create(
        model="gpt-4",
        messages=[{"role": "user", "content": "Count to 3"}],
        stream=True
    )

    chunk_count = 0
    content = ""

    for chunk in stream:
        chunk_count += 1

        # Verify chunk structure
        assert_ok("choices" in chunk, "stream chunk missing choices")

        delta = chunk.choices[0].get("delta", {})
        if "content" in delta:
            content += delta.content

    assert_ok(chunk_count > 0, "stream no chunks received")
    assert_ok(len(content) > 0, "stream no content received")

    print("✓ Streaming OK")


def test_error_handling():
    """Test error handling"""
    print("\n[5/5] Testing error handling...")

    try:
        openai.ChatCompletion.create(
            model="invalid-model-does-not-exist",
            messages=[{"role": "user", "content": "test"}]
        )
        assert_ok(False, "error handling should have raised exception")
    except openai.error.OpenAIError as e:
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
