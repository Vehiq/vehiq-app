"""Stripe catalog setup for Sharago — 3 products × 2 intervals (Iter 53).

Products:
  - Sharago Premium (B2C):   19 PLN/mo, 179 PLN/yr
  - Sharago Warsztat Pro:   299 PLN/mo, 2990 PLN/yr
  - Sharago Dealer Pro:     699 PLN/mo, 6990 PLN/yr

Idempotent — safe to re-run after each deploy.
"""
import os
import stripe
from dotenv import load_dotenv

load_dotenv("/app/backend/.env")
stripe.api_key = os.environ["STRIPE_SECRET_KEY"]

CATALOG = [
    {
        "emergent_product_id": "sharago_premium",
        "name": "Sharago Premium",
        "tax_code": "txcd_10103001",  # SaaS
        "prices": [
            {"lookup_key": "sharago_premium_monthly", "amount": 1900,  "currency": "pln", "interval": "month"},
            {"lookup_key": "sharago_premium_yearly",  "amount": 17900, "currency": "pln", "interval": "year"},
        ],
    },
    {
        "emergent_product_id": "sharago_workshop_pro",
        "name": "Sharago Warsztat Pro",
        "tax_code": "txcd_10103001",
        "prices": [
            {"lookup_key": "sharago_workshop_monthly", "amount": 29900,  "currency": "pln", "interval": "month"},
            {"lookup_key": "sharago_workshop_yearly",  "amount": 299000, "currency": "pln", "interval": "year"},
        ],
    },
    {
        "emergent_product_id": "sharago_dealer_pro",
        "name": "Sharago Dealer Pro",
        "tax_code": "txcd_10103001",
        "prices": [
            {"lookup_key": "sharago_dealer_monthly", "amount": 69900,  "currency": "pln", "interval": "month"},
            {"lookup_key": "sharago_dealer_yearly",  "amount": 699000, "currency": "pln", "interval": "year"},
        ],
    },
]


def get_or_create_product(entry):
    for p in stripe.Product.list(active=True).auto_paging_iter():
        md = p.to_dict().get("metadata", {})
        if md.get("emergent_product_id") == entry["emergent_product_id"]:
            return p
    return stripe.Product.create(
        name=entry["name"],
        tax_code=entry.get("tax_code"),
        metadata={"managed_by": "emergent", "emergent_product_id": entry["emergent_product_id"]},
    )


def sync_prices(product, price_specs):
    for p in price_specs:
        existing = stripe.Price.list(lookup_keys=[p["lookup_key"]], active=True, limit=1).data
        if existing and (existing[0].unit_amount != p["amount"] or existing[0].currency != p["currency"]):
            stripe.Price.modify(existing[0].id, active=False)
            existing = []
        if not existing:
            kwargs = dict(
                product=product.id,
                unit_amount=p["amount"],
                currency=p["currency"],
                lookup_key=p["lookup_key"],
                transfer_lookup_key=True,
            )
            if p.get("interval"):
                kwargs["recurring"] = {"interval": p["interval"]}
            stripe.Price.create(**kwargs)


def main():
    for entry in CATALOG:
        prod = get_or_create_product(entry)
        sync_prices(prod, entry["prices"])
        print(f"✓ {entry['name']} ({prod.id})")


if __name__ == "__main__":
    main()
    print("\nCatalog synced.")
