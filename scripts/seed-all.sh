#!/bin/bash
# Loads every pre-built template into your database in one go.
# Usage: bash scripts/seed-all.sh YOUR_COMPANY_ID

COMPANY_ID="$1"

if [ -z "$COMPANY_ID" ]; then
  echo "Usage: bash scripts/seed-all.sh YOUR_COMPANY_ID"
  echo ""
  echo "Find your company ID first with:"
  echo "  node --env-file=.env scripts/list-companies.js"
  exit 1
fi

echo "Seeding all templates for company: $COMPANY_ID"
echo ""

INDIVIDUAL_SCRIPTS=(
  "seed-block-inspection-template.js"
  "seed-checkin-summary-template.js"
  "seed-checkout-standalone-template.js"
  "seed-checkout-summary-template.js"
  "seed-commercial-site-checklist-template.js"
  "seed-completion-statement-template.js"
  "seed-ffhh-assessment-template.js"
  "seed-fra-prioritising-tool-template.js"
  "seed-hhsrs-checklist-template.js"
  "seed-hmo-checklist-template.js"
  "seed-hmo-management-checklist-template.js"
  "seed-landlord-maintenance-report-template.js"
  "seed-legionella-12month-review-template.js"
  "seed-legionella-risk-assessment-template.js"
  "seed-legionella-risk-assessment-visible-template.js"
  "seed-midterm-general-awaabs-rrb-template.js"
  "seed-midterm-inspection-report-template.js"
  "seed-midterm-simple-template.js"
  "seed-midterm-studio-template.js"
  "seed-monthly-estate-inspection-template.js"
  "seed-proptmate-midterm-standard-template.js"
  "seed-residential-room-by-room-awaabs-rrb-template.js"
  "seed-room-template.js"
  "seed-selfservice-post-checkin-template.js"
  "seed-selfservice-post-works-feedback-template.js"
  "seed-selfservice-pre-checkout-template.js"
  "seed-selfservice-property-appraisal-template.js"
  "seed-selfservice-property-inspection-template.js"
  "seed-snagging-report-template.js"
  "seed-temp-accommodation-inspection-template.js"
  "seed-temp-accommodation-studio-template.js"
)

MIDTERM_VARIANTS=("1bed-apartment" "1bed-house" "2bed-apartment" "2bed-house" "3bed-apartment" "3bed-house" "4bed-house" "5bed-house" "6bed-house")
INVENTORY_VARIANTS=("1bed-apartment" "1bed-house" "2bed-apartment" "2bed-house" "3bed-apartment" "3bed-house" "4bed-apartment" "4bed-house" "5bed-house" "6bed-house")

COUNT=0
FAILED=0

for script in "${INDIVIDUAL_SCRIPTS[@]}"; do
  echo "→ $script"
  if node --env-file=.env "scripts/$script" "$COMPANY_ID" > /dev/null 2>&1; then
    COUNT=$((COUNT+1))
  else
    echo "  ✗ failed"
    FAILED=$((FAILED+1))
  fi
done

for variant in "${MIDTERM_VARIANTS[@]}"; do
  echo "→ Mid Term: $variant"
  if node --env-file=.env scripts/seed-midterm-template.js "$COMPANY_ID" "$variant" > /dev/null 2>&1; then
    COUNT=$((COUNT+1))
  else
    echo "  ✗ failed"
    FAILED=$((FAILED+1))
  fi
done

for variant in "${INVENTORY_VARIANTS[@]}"; do
  echo "→ Inventory: $variant"
  if node --env-file=.env scripts/seed-inventory-template.js "$COMPANY_ID" "$variant" > /dev/null 2>&1; then
    COUNT=$((COUNT+1))
  else
    echo "  ✗ failed"
    FAILED=$((FAILED+1))
  fi
done

echo ""
echo "Done. $COUNT templates created, $FAILED failed."
