import { Octokit } from "@octokit/rest";
import type { GitHubIssue } from "../types/index.js";

export class GitHubClient {
  private octokit: Octokit;

  constructor(token: string) {
    this.octokit = new Octokit({ auth: token });
  }

  async listIssues(owner: string, repo: string): Promise<GitHubIssue[]> {
    const response = await this.octokit.issues.listForRepo({
      owner,
      repo,
      state: "all",
      per_page: 100
    });

    return response.data.map(issue => ({
      number: issue.number,
      title: issue.title,
      state: issue.state as "open" | "closed",
      body: issue.body || undefined,
      assignees: issue.assignees?.map(a => a.login),
      due_on: issue.milestone?.due_on || undefined,
      html_url: issue.html_url,
      repository: `${owner}/${repo}`
    }));
  }

  async getIssue(owner: string, repo: string, issueNumber: number): Promise<GitHubIssue> {
    const response = await this.octokit.issues.get({
      owner,
      repo,
      issue_number: issueNumber
    });

    return {
      number: response.data.number,
      title: response.data.title,
      state: response.data.state as "open" | "closed",
      body: response.data.body || undefined,
      assignees: response.data.assignees?.map(a => a.login),
      due_on: response.data.milestone?.due_on || undefined,
      html_url: response.data.html_url,
      repository: `${owner}/${repo}`
    };
  }

  async createIssue(
    owner: string,
    repo: string,
    title: string,
    body?: string,
    labels?: string[]
  ): Promise<GitHubIssue> {
    const response = await this.octokit.issues.create({
      owner,
      repo,
      title,
      body,
      labels
    });

    return {
      number: response.data.number,
      title: response.data.title,
      state: response.data.state as "open" | "closed",
      body: response.data.body || undefined,
      assignees: response.data.assignees?.map(a => a.login),
      html_url: response.data.html_url,
      repository: `${owner}/${repo}`
    };
  }

  async updateIssue(
    owner: string,
    repo: string,
    issueNumber: number,
    updates: {
      title?: string;
      body?: string;
      state?: "open" | "closed";
      labels?: string[];
      assignees?: string[];
    }
  ): Promise<void> {
    await this.octokit.issues.update({
      owner,
      repo,
      issue_number: issueNumber,
      ...updates
    });
  }

  async addComment(owner: string, repo: string, issueNumber: number, body: string): Promise<void> {
    await this.octokit.issues.createComment({
      owner,
      repo,
      issue_number: issueNumber,
      body
    });
  }
}
