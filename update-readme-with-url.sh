#!/bin/bash
# Quick script to update README with your live demo URL

echo "Enter your Railway deployment URL (without https://):"
read DEPLOY_URL

# Update README
sed -i '' "s|## 🎮 Quick Start|## 🎮 Live Demo\n\n**Try it now:** https://$DEPLOY_URL\n\nWatch AI agents compete in real-time! Open the URL and see the 3D world instantly.\n\n## 🎮 Quick Start|" README.md

echo "✅ README updated with live demo URL!"
echo "Run: git add README.md && git commit -m 'Add live demo URL' && git push"
