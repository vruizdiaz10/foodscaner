const ELEMENT_IDS = [
  'btn-toggle-camera', 'camera-select-wrapper', 'camera-select', 'barcode-form',
  'barcode-input', 'interactive-scanner', 'result-empty', 'result-loading',
  'result-rejected', 'result-success', 'product-img', 'product-name', 'product-brand',
  'product-barcode', 'calories-val', 'calories-progress', 'calories-level', 'card-calories',
  'sugars-val', 'sugars-progress', 'sugars-level', 'card-sugars', 'proteins-val',
  'proteins-progress', 'proteins-level', 'card-proteins', 'allergens-list',
  'allergens-safe-msg', 'no-nutrition-alert', 'analysis-grid', 'card-carbs', 'carbs-val',
  'carbs-net', 'carbs-progress', 'carbs-level', 'card-sellos', 'sellos-container',
  'rejected-title', 'rejected-message', 'rejected-product-name', 'rejected-product-category',
  'dietary-section', 'dietary-gluten-status', 'dietary-gluten-detail', 'dietary-vegan-status',
  'dietary-vegan-detail', 'dietary-vegetarian-status', 'dietary-vegetarian-detail',
  'dietary-kosher-status', 'dietary-kosher-detail', 'dietary-halal-status', 'dietary-halal-detail',
  'dietary-organic-status', 'dietary-organic-detail', 'dietary-non-gmo-status',
  'dietary-non-gmo-detail', 'dietary-no-additives-status', 'dietary-no-additives-detail',
  'dietary-palm-oil-free-status', 'dietary-palm-oil-free-detail', 'dietary-fair-trade-status',
  'dietary-fair-trade-detail', 'allergen-icon-grid', 'traces-section', 'traces-list',
  'card-not-recommended', 'not-recommended-container', 'ingredients-section', 'ingredients-text',
  'nutrition-section', 'nutrition-tbody', 'ai-loading', 'ai-error', 'confidence-ai',
  'confidence-ai-level', 'confidence-notes', 'confidence-notes-text', 'db-disclaimer',
  'db-disclaimer-source', 'card-diabetes', 'diabetes-risk', 'diabetes-impact', 'diabetes-notes',
  'card-health-risks', 'card-hypertension', 'hypertension-risk', 'hypertension-progress',
  'hypertension-level', 'hypertension-sodium', 'hypertension-notes', 'card-cholesterol',
  'cholesterol-risk', 'cholesterol-progress', 'cholesterol-level', 'cholesterol-satfat',
  'cholesterol-notes', 'card-weight', 'dietary-vegan-attr', 'dietary-vegetarian-attr',
  'dietary-kosher-attr', 'dietary-halal-attr', 'dietary-organic-attr', 'dietary-non-gmo-attr',
  'dietary-no-additives-attr', 'dietary-palm-oil-free-attr', 'dietary-fair-trade-attr',
  'dietary-gluten-attr'
]

if (typeof document !== 'undefined') {
  for (const id of ELEMENT_IDS) {
    const el = document.createElement('div')
    el.id = id
    document.body.appendChild(el)
  }
}
