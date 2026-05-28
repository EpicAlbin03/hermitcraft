# Web App

The Web App is the public, read-only HermitCraft site for visitors to browse creators, watch videos, see live status, and access curated links and map downloads. It exists to present HermitCraft content in a user-facing way.

## Language

**Web App**:
The public, read-only site that presents HermitCraft content to visitors.
_Avoid_: Frontend, UI, website

**Visitor**:
A person using the public site.
_Avoid_: User, admin, operator

**Public Read-Only**:
A boundary where visitors can browse, filter, navigate, and follow outbound links or downloads, but cannot mutate project data.
_Avoid_: Public API, admin-safe, editable

**Creator**:
A HermitCraft creator as presented by the site, including that creator's title, banner, avatar, metrics, links, live status, and videos.
_Avoid_: Channel, member profile

**Creator Page**:
The public page for one **Creator**.
_Avoid_: Channel page, profile route

**Live Status**:
The public indication that a **Creator** is currently live, with separate signals for Twitch livestreaming and a current YouTube live video.
_Avoid_: Badge, stream flag

**Video**:
A YouTube video presented in the Web App as browseable creator content when it is not being treated as a live video experience.
_Avoid_: Upload, content item

**Live Video**:
A current or scheduled YouTube live experience presented separately from normal **Video** in the Web App.
_Avoid_: Normal video, upload

**Livestream**:
A browsable video class in the Web App that includes live, upcoming, and completed livestream entries.
_Avoid_: Live status, normal video

**Short**:
A distinct kind of **Video** presented through its own browsing mode in the Web App.
_Avoid_: Shorts video, clip

**External Link**:
An outbound public destination presented by the Web App.
_Avoid_: Download, social blob

**Creator Link**:
An **External Link** associated with one **Creator** and presented on that creator's page.
_Avoid_: Channel link, social blob

**Site Link**:
An **External Link** presented by the Web App at the site level rather than for one specific **Creator**.
_Avoid_: Global link, nav link

**Map Download**:
A public HermitCraft downloadable world, map, or closely related packaged play artifact presented by the Web App, whether delivered directly by the site or through an external marketplace destination, sometimes with multiple edition-specific options.
_Avoid_: External link, asset

**Sidebar**:
The persistent navigation and discovery surface that exposes creators, live state, public links, map downloads, and policy or navigation entries.
_Avoid_: Nav chrome, shell

**Video Feed**:
A public cross-creator browsing surface for **Video**, **Short**, and **Livestream** browsing, distinct from a single **Creator Page**.
_Avoid_: Homepage, listing page

**Creator Video Feed**:
A video browsing surface scoped to one **Creator Page** that can present **Video**, **Short**, and **Livestream** browsing modes.
_Avoid_: Creator video list, uploads tab

## Relationships

- The **Web App** serves many **Visitors**
- The **Web App** is strictly **Public Read-Only**
- A **Visitor** may browse many **Creators**
- Each **Creator** has one **Creator Page** in the Web App
- A **Creator Page** presents one **Creator**
- A **Creator Page** presents **Live Status**, **Creator Links**, and one **Creator Video Feed**
- A **Creator** may have one **Live Status**
- A **Live Status** may include one current **Live Video**
- A **Creator** may have many **Videos**
- A **Short** is a kind of **Video**
- A **Livestream** is a browsable video class distinct from normal **Video** browsing
- A **Live Video** is presented separately from **Video** in the Web App
- A **Creator** may have many **Creator Links**
- The **Web App** may present many **Site Links**
- Both **Creator Links** and **Site Links** are **External Links**
- The **Web App** presents many **Map Downloads**
- A **Map Download** may offer one or many edition-specific options
- The **Sidebar** is a primary discovery surface within the **Web App**
- The **Sidebar** presents many **Creators**, **Site Links**, and **Map Downloads**
- The **Sidebar** may expose **Live Status** entry points for a **Creator**
- The **Video Feed** presents **Video**, **Short**, and **Livestream** browsing across many **Creators**
- A **Creator Page** includes one **Creator Video Feed**
- A **Creator Video Feed** presents **Video**, **Short**, and **Livestream** browsing for one **Creator**

## Example dialogue

> **Dev:** "When a visitor opens /geminitay, are they viewing a channel or a creator?"
> **Domain expert:** "They are viewing a **Creator Page** for one **Creator**. The site may source data from YouTube channel fields, but the public concept is still the **Creator**."
>
> **Dev:** "Is **Live Status** just a badge on the sidebar?"
> **Domain expert:** "No. **Live Status** is a first-class public concept. It appears on the **Creator Page**, in the **Sidebar**, and through a separate **Live Video** experience from normal **Video** browsing."
>
> **Dev:** "Are the links in the sidebar the same as the links on a creator page?"
> **Domain expert:** "They are both **External Links**, but sidebar entries are **Site Links** while creator-page entries are **Creator Links**."
>
> **Dev:** "Are map downloads just another kind of link?"
> **Domain expert:** "No. An **External Link** sends the visitor somewhere else, while a **Map Download** delivers a HermitCraft world or map artifact from the site or a marketplace destination."
>
> **Dev:** "What is /videos?"
> **Domain expert:** "It is the **Video Feed**, a public cross-creator browsing surface distinct from a single **Creator Page**."
>
> **Dev:** "And the videos section on a creator page?"
> **Domain expert:** "That is the **Creator Video Feed** — the same kind of browsing experience, but scoped to one **Creator**."
>
> **Dev:** "Does the livestreams tab only mean things that are live right now?"
> **Domain expert:** "No. A **Livestream** is the broader browsing class that includes live, upcoming, and completed livestream entries, while **Live Status** means a creator is live now."

## Flagged ambiguities

- "maps" in the UI includes some downloadable packaged play artifacts beyond literal world saves — resolved: keep the canonical public term **Map Download** for the whole visitor-facing category.
