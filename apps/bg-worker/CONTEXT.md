# Background Worker

The Background Worker runs recurring jobs that keep local content data fresh. It exists as the primary automated actor for triggering sync work without user interaction.

## Language

**Background Worker**:
The long-running process that schedules and executes recurring sync jobs.
_Avoid_: Cron app, daemon

**Sync Job**:
A recurring unit of work that refreshes a specific slice of external platform data.
_Avoid_: Task, poller

## Relationships

- The **Background Worker** runs many **Sync Jobs**
- Each **Sync Job** invokes **Content Sync** capabilities
- **Content Sync** may also be invoked manually outside the **Background Worker**

## Example dialogue

> **Dev:** "Does the **Background Worker** know how to talk to YouTube directly?"
> **Domain expert:** "No — it only runs **Sync Jobs**; the platform-specific fetch logic lives in **Content Sync**."
