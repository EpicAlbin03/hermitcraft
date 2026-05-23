# Content Sync

Content Sync reconciles external platform data with the project’s canonical stored records. It exists to turn YouTube and Twitch responses into consistent channel and video updates.

## Language

**Content Sync**:
The context that fetches platform data and applies it to stored records.
_Avoid_: Sync, scraper, importer

**Platform Source**:
An external system that Content Sync reads from to refresh stored records.
_Avoid_: Provider, upstream, API

**Admin**:
An operator who may invoke sync or data-management flows outside the public application.
_Avoid_: User, visitor

**Creator Catalog**:
The locally stored set of tracked creators and curated fields that Content Sync reads before refresh and updates after reconciliation.
_Avoid_: Channel table, creator cache

**Creator Sync**:
The operation that refreshes a creator’s primary YouTube channel data and linked Twitch channel data when present, while preserving locally curated external links.
_Avoid_: Channel sync, channel import, channel update

**Video Sync**:
The operation that discovers and refreshes stored videos for creators from a platform source.
_Avoid_: Video import, video update

**Live Status Sync**:
The operation that refreshes platform-specific livestream state for a creator.
_Avoid_: Stream check, presence check

## Relationships

- **Content Sync** reads from one or more **Platform Sources**
- **Content Sync** reads and updates the **Creator Catalog**
- A **Creator Sync** refreshes **Creators**
- A **Video Sync** refreshes **Videos**
- A **Live Status Sync** refreshes **Twitch Live Status** and **YouTube Live Video** state

## Example dialogue

> **Dev:** "Is **Live Status Sync** the same thing as **Video Sync**?"
> **Domain expert:** "No — **Video Sync** refreshes video records broadly, while **Live Status Sync** refreshes platform-specific livestream state for a creator."

## Flagged ambiguities

- "channel" was being used to mean both the person aggregate and the YouTube identity anchor — resolved: the canonical aggregate term is **Creator**.
