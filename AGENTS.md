# Gestão TF

- Work on the existing project, database and deployment. Preserve clients, operations, imported history, partner settings and the current white theme. Never reset or reimport the production database to fix an interface issue.
- The white/classic theme is the only active CRM appearance. Do not restore the retired Preto Luxo theme or a theme picker. Keep layout and responsive changes consistent across modules.
- Clients and operations in the explicitly selected database are the source of truth. PostgreSQL remains authoritative until a current full snapshot is verified in MongoDB and the provider is switched, unless the user explicitly authorizes starting a fresh MongoDB database and importing history later. Financial screens and partner reports must share the same calculations. Do not introduce a new commission distribution rule without an explicit request.
- Monetary values remain numeric internally (integer cents in storage). Display Brazilian reais with R$, thousands separators and two decimal places using the shared money utilities.
- Edits update existing IDs. Preserve omitted fields, payment history, partner adjustments and imported provenance.
- Exercise data mutations in isolated test schemas (PostgreSQL) or `tf_test_` databases (MongoDB). Production verification is read-only unless a specific data correction, transfer or empty initialization is authorized. Never activate an empty destination without explicit authorization or replace current data with an older local snapshot.
