# Gestão TF

- Work on the existing project, database and deployment. Preserve clients, operations, imported history, partner settings and both themes. Never reset or reimport the production database to fix an interface issue.
- Unless the user expressly limits a change to one theme, every layout, structure, spacing and responsive change applies to both themes. Keep shared layout in shared components/styles; theme styles define visual identity only.
- Clients and operations in PostgreSQL are the source of truth. Financial screens and partner reports must share the same calculations. Do not introduce a new commission distribution rule without an explicit request.
- Monetary values remain numeric internally (integer cents in storage). Display Brazilian reais with R$, thousands separators and two decimal places using the shared money utilities.
- Edits update existing IDs. Preserve omitted fields, payment history, partner adjustments and imported provenance.
- Exercise data mutations in isolated test schemas. Production verification is read-only unless a specific data correction is authorized.
