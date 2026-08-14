# Migrations Supabase

## Nouvelle base

Exécuter une seule fois [`../init.sql`](../init.sql) dans l’éditeur SQL Supabase.

## Évolutions

Chaque changement de schéma après l’init vit ici :

```
supabase/migration/
  01_exemple.sql
  02_autre_changement.sql
  ...
```

**Convention de nommage :** `NN_nom_court.sql`

- `NN` = numéro séquentiel sur 2 chiffres minimum (`01`, `02`, … `10`, `11`)
- `nom_court` = snake_case, descriptif
- Scripts **idempotents** quand c’est possible (`if not exists`, `drop … if exists`)
- Une migration = un sujet (une feature, un correctif)

**Ordre d’exécution :** numéro croissant, uniquement sur les bases déjà initialisées avec `init.sql`.
