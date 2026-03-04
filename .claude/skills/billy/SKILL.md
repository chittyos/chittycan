---
name: billy
description: Send code to Billy Bullshit for a brutally honest review. Use when user says /billy, "ask billy", "billy review", or "get billy's opinion"
disable-model-invocation: true
---

# Billy Bullshit Code Review

Send code to Billy Bullshit (billy.chitty.cc) for a brutally honest BS-scored review.

## Usage

- `/billy` — review current git diff
- `/billy <file-path>` — review a specific file
- `/billy roast <target>` — roast something

## Steps

### Review mode (default)

1. If a file path is provided as argument, read that file
2. If no argument, run `git diff HEAD` to get current unstaged changes
3. If no diff either, ask the user what to review
4. Check Billy is online: `curl -s https://billy.chitty.cc/health`
5. POST the code to `https://billy.chitty.cc/review`:
   ```json
   {
     "code": "<content (max 500 lines)>",
     "language": "typescript",
     "context": "<filename or 'git diff'>"
   }
   ```
6. Display Billy's full response including BS score and categorized issues
7. If Billy is offline, report the error — do not substitute your own review

### Roast mode

1. If the first argument is "roast", join remaining args as the target
2. POST to `https://billy.chitty.cc/roast`:
   ```json
   {
     "target": "<the target>",
     "context": "chittycan CLI project"
   }
   ```
3. Display Billy's response verbatim
