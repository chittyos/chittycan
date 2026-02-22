#!/bin/bash
# ChittyCan Validation Script

echo "🔍 ChittyCan v0.4.0 Validation"
echo "=============================="
echo ""

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

PASSED=0
FAILED=0

check() {
  if [ $? -eq 0 ]; then
    echo -e "${GREEN}✓${NC} $1"
    ((PASSED++))
  else
    echo -e "${RED}✗${NC} $1"
    ((FAILED++))
  fi
}

# 1. Build Check
echo "📦 Build Validation"
echo "-------------------"
npm run build > /dev/null 2>&1
check "TypeScript compilation"

[ -d "dist" ]
check "dist/ directory exists"

[ -f "dist/index.js" ]
check "dist/index.js exists"

[ -f "dist/lib/stemcell.js" ]
check "Stemcell compiled"

[ -f "dist/plugins/ai/openai.js" ]
check "OpenAI connector compiled"

echo ""

# 2. Test Suite
echo "🧪 Test Suite"
echo "-------------"
npm test > /dev/null 2>&1
check "All tests passing"

echo ""

# 3. File Structure
echo "📁 File Structure"
echo "----------------"

[ -f "src/lib/stemcell.ts" ]
check "Stemcell brief system"

[ -f "src/plugins/ai/openai.ts" ]
check "OpenAI connector"

[ -f "src/plugins/ai/anthropic.ts" ]
check "Anthropic connector"

[ -f "src/plugins/ai/ollama.ts" ]
check "Ollama connector"

[ -f "src/plugins/ai/groq.ts" ]
check "Groq connector"

[ -f "src/plugins/ai/replicate.ts" ]
check "Replicate connector"

[ -f "src/plugins/ai/together.ts" ]
check "Together AI connector"

[ -f "src/plugins/ai/huggingface.ts" ]
check "Hugging Face connector"

[ -f "src/plugins/ai/cohere.ts" ]
check "Cohere connector"

[ -f "src/plugins/chittyos/chittyid.ts" ]
check "ChittyID extension"

[ -f "src/plugins/chittyos/chittyauth.ts" ]
check "ChittyAuth extension"

[ -f "src/plugins/chittyos/chittyconnect.ts" ]
check "ChittyConnect extension"

[ -f "src/plugins/chittyos/chittyregistry.ts" ]
check "ChittyRegistry extension"

[ -f "src/plugins/chittyos/chittyrouter.ts" ]
check "ChittyRouter extension"

echo ""

# 4. Documentation
echo "📚 Documentation"
echo "---------------"

[ -f "README.md" ]
check "README.md"

[ -f "CHANGELOG.md" ]
check "CHANGELOG.md"

[ -f "MULTI_MODEL.md" ]
check "MULTI_MODEL.md"

[ -f "CHITTYOS_INTEGRATION.md" ]
check "CHITTYOS_INTEGRATION.md"

[ -f "LICENSE" ]
check "LICENSE (MIT)"

echo ""

# 5. Package Validation
echo "📦 Package Validation"
echo "--------------------"

grep -q '"name": "chittycan"' package.json
check "Package name: chittycan"

grep -q '"version": "0.4.0"' package.json
check "Version: 0.4.0"

grep -q '"author": "chittycorp"' package.json
check "Author: chittycorp"

grep -q '"can":' package.json
check "Binary: can"

echo ""

# 6. Stemcell Functionality
echo "🧬 Stemcell Brief"
echo "----------------"

node -e "
const { generateStemcellBrief } = require('./dist/lib/stemcell.js');
generateStemcellBrief(process.cwd(), {
  juncture: 'validation',
  purpose: 'Validate ChittyCan installation'
}).then(brief => {
  if (brief.project.name === 'chittycan') {
    console.log('✓ Generates brief correctly');
    process.exit(0);
  } else {
    console.error('✗ Brief generation failed');
    process.exit(1);
  }
}).catch(err => {
  console.error('✗ Stemcell error:', err.message);
  process.exit(1);
});
" 2>&1 | grep -q "✓"
check "Stemcell brief generation"

echo ""

# 7. Plugin System
echo "🔌 Plugin System"
echo "---------------"

node -e "
const { aiPlugins } = require('./dist/plugins/ai/index.js');
if (aiPlugins.length === 8) {
  console.log('✓ 8 AI platforms loaded');
  process.exit(0);
} else {
  console.error('✗ Expected 8 plugins, got', aiPlugins.length);
  process.exit(1);
}
" 2>&1 | grep -q "✓"
check "8 AI platform connectors loaded"

echo ""

# 8. Git Status
echo "📋 Git Status"
echo "------------"

git status > /dev/null 2>&1
check "Git repository"

[ -z "$(git status --porcelain)" ]
if [ $? -eq 0 ]; then
  check "Working tree clean"
else
  echo -e "${YELLOW}⚠${NC} Working tree has changes"
fi

echo ""

# Summary
echo "=============================="
echo -e "${GREEN}✓ Passed: $PASSED${NC}"
if [ $FAILED -gt 0 ]; then
  echo -e "${RED}✗ Failed: $FAILED${NC}"
  echo ""
  echo "❌ Validation FAILED"
  exit 1
else
  echo ""
  echo "✅ All validations PASSED!"
  echo ""
  echo "🚀 ChittyCan is ready for:"
  echo "   - npm publish"
  echo "   - Claude marketplace"
  echo "   - Production use"
  exit 0
fi
