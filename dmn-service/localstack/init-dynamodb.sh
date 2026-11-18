#!/bin/bash
# Executed by LocalStack on startup (ready.d hook). Creates the DMN rule table.
awslocal dynamodb create-table \
  --table-name DmnRules \
  --attribute-definitions AttributeName=ruleId,AttributeType=S \
  --key-schema AttributeName=ruleId,KeyType=HASH \
  --billing-mode PAY_PER_REQUEST \
  --region ap-south-1 || true
echo "DmnRules table ready"
