import { Client } from "@notionhq/client";
import type { NotionAction, SyncState } from "../types/index.js";

export class NotionClient {
  private client: Client;

  constructor(token: string) {
    this.client = new Client({ auth: token });
  }

  async queryDatabase(databaseId: string): Promise<NotionAction[]> {
    const response = await this.client.databases.query({
      database_id: databaseId
    });

    return response.results.map((page: any) => this.pageToAction(page));
  }

  async updatePage(pageId: string, updates: Partial<NotionAction>): Promise<void> {
    const properties: any = {};

    if (updates.status) {
      properties.Status = { status: { name: updates.status } };
    }

    if (updates.due) {
      properties.Due = { date: { start: updates.due } };
    }

    if (updates.syncState) {
      properties["Sync State"] = { select: { name: updates.syncState } };
    }

    if (updates.lastSync) {
      properties["Last Sync"] = { date: { start: updates.lastSync } };
    }

    if (updates.githubIssueUrl) {
      properties["GitHub Issue URL"] = { url: updates.githubIssueUrl };
    }

    if (updates.githubIssueNumber !== undefined) {
      properties["Issue Number"] = { number: updates.githubIssueNumber };
    }

    if (updates.githubRepo) {
      properties.Repo = { rich_text: [{ text: { content: updates.githubRepo } }] };
    }

    await this.client.pages.update({
      page_id: pageId,
      properties
    });
  }

  async createPage(databaseId: string, action: NotionAction): Promise<string> {
    const properties: any = {
      Name: { title: [{ text: { content: action.title } }] },
      Status: { status: { name: action.status } }
    };

    if (action.due) {
      properties.Due = { date: { start: action.due } };
    }

    if (action.assignee) {
      // Note: This requires user mentions, which need user IDs
      // For now, we'll use rich text
      properties.Assignee = { rich_text: [{ text: { content: action.assignee } }] };
    }

    if (action.githubIssueUrl) {
      properties["GitHub Issue URL"] = { url: action.githubIssueUrl };
    }

    if (action.githubIssueNumber) {
      properties["Issue Number"] = { number: action.githubIssueNumber };
    }

    if (action.githubRepo) {
      properties.Repo = { rich_text: [{ text: { content: action.githubRepo } }] };
    }

    if (action.syncState) {
      properties["Sync State"] = { select: { name: action.syncState } };
    }

    properties["Last Sync"] = { date: { start: new Date().toISOString() } };

    const response = await this.client.pages.create({
      parent: { database_id: databaseId },
      properties
    });

    return response.id;
  }

  private pageToAction(page: any): NotionAction {
    const props = page.properties;

    return {
      id: page.id,
      title: this.extractTitle(props.Name || props.Title),
      status: this.extractSelect(props.Status) as any || "To Do",
      due: this.extractDate(props.Due),
      assignee: this.extractText(props.Assignee),
      notes: this.extractText(props.Notes),
      githubIssueUrl: this.extractUrl(props["GitHub Issue URL"]),
      githubIssueNumber: this.extractNumber(props["Issue Number"]),
      githubRepo: this.extractText(props.Repo),
      syncState: this.extractSelect(props["Sync State"]) as SyncState,
      lastSync: this.extractDate(props["Last Sync"])
    };
  }

  private extractTitle(prop: any): string {
    if (!prop?.title) return "";
    return prop.title.map((t: any) => t.plain_text).join("");
  }

  private extractText(prop: any): string | undefined {
    if (!prop?.rich_text) return undefined;
    return prop.rich_text.map((t: any) => t.plain_text).join("");
  }

  private extractSelect(prop: any): string | undefined {
    return prop?.select?.name || prop?.status?.name;
  }

  private extractDate(prop: any): string | undefined {
    return prop?.date?.start;
  }

  private extractUrl(prop: any): string | undefined {
    return prop?.url;
  }

  private extractNumber(prop: any): number | undefined {
    return prop?.number;
  }
}
