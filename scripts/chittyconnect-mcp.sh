#!/bin/bash
#
# ChittyConnect MCP Server Wrapper for Claude Code
#
# This script bridges Claude Code's MCP client to ChittyConnect's MCP server.
# It uses the 'can' CLI to communicate with ChittyConnect at connect.chitty.cc.
#
# Usage:
#   ./chittyconnect-mcp.sh
#
# Environment variables:
#   CHITTY_TOKEN - API token for ChittyConnect (required)
#   CHITTY_BASE_URL - Base URL for ChittyConnect (default: https://connect.chitty.cc)
#

set -euo pipefail

# Check for required token
if [ -z "${CHITTY_TOKEN:-}" ]; then
  echo '{"jsonrpc":"2.0","error":{"code":-32000,"message":"CHITTY_TOKEN environment variable not set"},"id":null}' >&2
  exit 1
fi

# Get base URL (default to production)
BASE_URL="${CHITTY_BASE_URL:-https://connect.chitty.cc}"

# Function to call ChittyConnect API
call_api() {
  local method="$1"
  local endpoint="$2"
  local data="${3:-{}}"

  curl -s -X "$method" \
    "${BASE_URL}${endpoint}" \
    -H "Authorization: Bearer ${CHITTY_TOKEN}" \
    -H "Content-Type: application/json" \
    -d "$data"
}

# MCP Protocol Handler
# Reads JSON-RPC requests from stdin and sends responses to stdout
handle_mcp_protocol() {
  while IFS= read -r line; do
    # Parse JSON-RPC request
    local method=$(echo "$line" | jq -r '.method // empty')
    local id=$(echo "$line" | jq -r '.id // null')
    local params=$(echo "$line" | jq -c '.params // {}')

    case "$method" in
      "initialize")
        # Initialize MCP connection
        local response=$(call_api "POST" "/api/v1/mcp/initialize" "$params")
        echo "{\"jsonrpc\":\"2.0\",\"result\":$response,\"id\":$id}"
        ;;

      "tools/list")
        # List available MCP tools
        local tools=$(call_api "GET" "/api/v1/mcp/tools")
        echo "{\"jsonrpc\":\"2.0\",\"result\":{\"tools\":$tools},\"id\":$id}"
        ;;

      "tools/call")
        # Call a specific tool
        local tool_name=$(echo "$params" | jq -r '.name')
        local tool_args=$(echo "$params" | jq -c '.arguments // {}')
        local result=$(call_api "POST" "/api/v1/mcp/tools/${tool_name}" "$tool_args")
        echo "{\"jsonrpc\":\"2.0\",\"result\":$result,\"id\":$id}"
        ;;

      "resources/list")
        # List available resources
        local resources=$(call_api "GET" "/api/v1/mcp/resources")
        echo "{\"jsonrpc\":\"2.0\",\"result\":{\"resources\":$resources},\"id\":$id}"
        ;;

      "resources/read")
        # Read a specific resource
        local uri=$(echo "$params" | jq -r '.uri')
        local resource=$(call_api "GET" "/api/v1/mcp/resources?uri=$(echo -n "$uri" | jq -sRr @uri)")
        echo "{\"jsonrpc\":\"2.0\",\"result\":$resource,\"id\":$id}"
        ;;

      "prompts/list")
        # List available prompts
        local prompts=$(call_api "GET" "/api/v1/mcp/prompts")
        echo "{\"jsonrpc\":\"2.0\",\"result\":{\"prompts\":$prompts},\"id\":$id}"
        ;;

      "prompts/get")
        # Get a specific prompt
        local prompt_name=$(echo "$params" | jq -r '.name')
        local prompt=$(call_api "GET" "/api/v1/mcp/prompts/${prompt_name}")
        echo "{\"jsonrpc\":\"2.0\",\"result\":$prompt,\"id\":$id}"
        ;;

      "ping")
        # Health check
        echo "{\"jsonrpc\":\"2.0\",\"result\":{\"status\":\"ok\"},\"id\":$id}"
        ;;

      *)
        # Unknown method
        echo "{\"jsonrpc\":\"2.0\",\"error\":{\"code\":-32601,\"message\":\"Method not found: $method\"},\"id\":$id}" >&2
        ;;
    esac
  done
}

# Main entry point
main() {
  # Check if ChittyConnect is accessible
  if ! call_api "GET" "/health" >/dev/null 2>&1; then
    echo '{"jsonrpc":"2.0","error":{"code":-32000,"message":"Cannot connect to ChittyConnect at '"$BASE_URL"'"},"id":null}' >&2
    exit 1
  fi

  # Start MCP protocol handler
  handle_mcp_protocol
}

# Run main
main
