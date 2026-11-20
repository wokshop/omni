# 0054: A record's files: its folder, plus Drive files linked in place

Date: 2026-11-20 · Status: accepted · Amends: ADR 0036 decision 5 ("a record's files are a folder
in Shared") · Builds on: ADR 0034, ADR 0035, ADR 0039

## Context

ADR 0036 made a company's or a deal's files one folder in Shared, `Clients / <company> / <deal>`.
That covers what a member uploads to the record. It does not cover the file that already lives
somewhere else in Drive: the brief in `Marketing`, the quote in someone's My files. Asked whether
attaching such a file should move it into the record's folder or copy it, the founder chose
neither on Nov 20, 2026: the record holds a reference, like a symlink, and Drive is not moved.

## Decision

1. **A record's Files are its folder plus its links.** Uploads, new folders and the contract's
   signed copy still go into the record's folder. "Add from Drive" links files or folders where
   they are. Nothing is moved or copied, so a file's bytes, versions, comments and sharing stay
   one thing in one place.
2. **Links are CRM rows.** `crm_file_links` (org_id, company_id | deal_id, node_id,
   added_by_member_id, created_at), unique per record and node. The node reference cascades:
   deleting the file for good, or the record, removes the link. Storage learns nothing.
3. **Each member sees the links they could open in Drive.** A link is read through Storage's
   member door: a node in Trash, in a teammate's My files, or gone is left out for that reader.
   So linking a file from My files shows it on the record to its owner only. Linking requires
   that the member can open every node now, else nothing is linked.
4. **The record's folder is made when the first link is added**, as on the first upload, so a
   record with files always has a folder for the apps to show and upload into.
5. **Removing a link never touches the file.** The row menus offer "Remove from <record>" on a
   link and Drive's own actions (rename, move, trash) on the folder's files.
6. **API.** `GET`/`POST /api/crm/{companies,deals}/:id/links` and `DELETE …/links/:nodeId`.
   Changes publish `crm.changed` for the record. People have no files.

## Consequences

- One additive table; links are CRM truth, backed up with the database like other `crm_*` rows.
- Listing links costs one Storage access check per link, capped at 200 per record.
- A link to a folder opens that folder in Drive; the record does not browse into it.
