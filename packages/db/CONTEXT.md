# Database

The Database context stores the project’s canonical records about tracked HermitCraft creators and their videos. It exists as the source of truth that other contexts refresh and consume.

## Language

**Admin**:
An operator who manages data outside the public application, typically through scripts, terminal commands, or direct database access.
_Avoid_: User, visitor

**Tracked**:
Explicitly included in this system for ongoing synchronization and storage.
_Avoid_: Cached, discovered, visible

**HermitCraft Creator**:
A creator who is part of the HermitCraft group.
_Avoid_: HermitCraft-related creator, affiliate

**Creator**:
A **HermitCraft Creator** explicitly selected for inclusion in the site, with a required primary YouTube channel and optional Twitch channel and external links.
_Avoid_: Channel, account, profile

**Primary YouTube Channel**:
The stable YouTube channel that uniquely identifies a **Creator** in this system.
_Avoid_: Creator, handle

**Twitch Channel**:
An optional Twitch identity linked to a **Creator** that does not define the creator’s core identity.
_Avoid_: Twitch details, Twitch metadata

**External Link**:
A creator-owned or creator-associated public URL attached to a **Creator** and curated locally by admins.
_Avoid_: Socials, website, link blob

**Twitch Live Status**:
Whether a creator’s linked Twitch channel is currently livestreaming.
_Avoid_: Live, stream status

**YouTube Live Video**:
The currently livestreaming **Video** for a creator’s primary YouTube channel, if any.
_Avoid_: Live, current stream

**Video**:
A tracked YouTube video that belongs to exactly one **Primary YouTube Channel** and, through it, exactly one **Creator**.
_Avoid_: Upload, content item, media

**Inaccessible Video**:
A stored YouTube video that is hidden from normal user-facing views and no longer tracked for normal sync and display, regardless of the upstream reason.
_Avoid_: Deleted video, gone video

**Short**:
A **Video** classified as YouTube short-form content.
_Avoid_: Shorts video, reel

## Relationships

- A **Creator** has exactly one **Primary YouTube Channel** in this system
- A **Creator** may have zero or one **Twitch Channel**
- A **Creator** may have many **External Links**
- A **Creator** may have one **Twitch Live Status**
- A **Creator** may have zero or one **YouTube Live Video**
- A **Primary YouTube Channel** has many **Videos**
- A **Video** belongs to exactly one **Primary YouTube Channel**
- An **Inaccessible Video** is a stored former **Video**
- A **YouTube Live Video** is a **Video**
- A **Short** is a **Video**
- A **Creator** has many **Videos** through the **Primary YouTube Channel**

## Example dialogue

> **Dev:** "If a **Video** becomes inaccessible on YouTube, do we delete it?"
> **Domain expert:** "No — it becomes an **Inaccessible Video**, disappears from normal user-facing views, and stays stored until an admin deletes it manually."

## Flagged ambiguities

- `channels` is the current table name, but the canonical domain term is **Creator** — resolved: keep the implementation name out of the glossary.
- "deleted" was being used for both upstream inaccessibility and local removal — resolved: an **Inaccessible Video** stays stored locally; deletion is an explicit **Admin** action.
- "tracked" was being used too broadly for videos — resolved: inaccessible/private videos may stay stored locally but are no longer tracked for normal sync and display.
- "links" could have implied scraped platform metadata — resolved: **External Links** are seeded locally and then curated by **Admins**.
- "primary YouTube channel" could have implied a mutable preference — resolved: it is the stable identity anchor for a **Creator**.
