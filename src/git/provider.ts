/**
 * Provider abstraction — scaffold for "sign in to GitHub / GitLab / Gitea
 * and pick a repo to clone." Concrete providers require OAuth app registration
 * (client ID + redirect), which is an external setup step deferred to a
 * follow-up wave.
 *
 * For Wave 5, only the *interface* is established so subsequent work doesn't
 * need to refactor the core. The current clone flow is provider-agnostic —
 * users paste any git URL.
 */

export interface RemoteRepo {
  name: string;
  owner: string;
  description: string;
  html_url: string;
  clone_url: string;
  private: boolean;
  default_branch: string;
}

export interface GitProvider {
  /** Short display name — "GitHub", "GitLab", "Gitea". */
  readonly id: string;
  readonly label: string;
  isAuthenticated(): Promise<boolean>;
  /** Starts the OAuth device flow. Implementations should surface the code. */
  signIn(): Promise<void>;
  signOut(): Promise<void>;
  /** Repos the signed-in user can access, sorted by most-recent activity. */
  listRepos(): Promise<RemoteRepo[]>;
}

const providers: Record<string, GitProvider> = {};

export const registerProvider = (p: GitProvider): void => {
  providers[p.id] = p;
};

export const getProvider = (id: string): GitProvider | null =>
  providers[id] ?? null;

export const listProviders = (): GitProvider[] => Object.values(providers);
