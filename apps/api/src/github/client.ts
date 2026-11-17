import { Octokit } from 'octokit';
import { createAppAuth } from '@octokit/auth-app';
import type { Clock } from './clock.js';
import { SystemClock } from './clock.js';
import type { InstallationTokenCache } from './token-cache.js';
import { InMemoryInstallationTokenCache } from './token-cache.js';

export interface GithubClient {
  getInstallationToken(installationId: number): Promise<string>;
  getInstallationOctokit(installationId: number): Promise<Octokit>;
}

export interface OctokitGithubClientOptions {
  appId: string | number;
  privateKey: string;
  clock?: Clock;
  cache?: InstallationTokenCache;
  tokenFetcher?: (installationId: number) => Promise<{ token: string; expiresAt: string | Date }>;
  octokitFactory?: (token: string) => Octokit;
}

export class OctokitGithubClient implements GithubClient {
  private appId: string | number;
  private privateKey: string;
  private cache: InstallationTokenCache;
  private clock: Clock;
  private tokenFetcher: (
    installationId: number,
  ) => Promise<{ token: string; expiresAt: string | Date }>;
  private octokitFactory: (token: string) => Octokit;

  constructor(options: OctokitGithubClientOptions) {
    this.appId = options.appId;
    this.privateKey = options.privateKey;
    this.clock = options.clock ?? new SystemClock();
    this.cache = options.cache ?? new InMemoryInstallationTokenCache(this.clock);
    this.octokitFactory =
      options.octokitFactory ?? ((token: string) => new Octokit({ auth: token }));

    if (options.tokenFetcher) {
      this.tokenFetcher = options.tokenFetcher;
    } else {
      const auth = createAppAuth({
        appId: this.appId,
        privateKey: this.privateKey,
      });

      this.tokenFetcher = async (installationId: number) => {
        const res = await auth({
          type: 'installation',
          installationId,
        });
        return {
          token: res.token,
          expiresAt: res.expiresAt,
        };
      };
    }
  }

  async getInstallationToken(installationId: number): Promise<string> {
    const cached = await this.cache.get(installationId);
    if (cached) {
      return cached;
    }

    const { token, expiresAt } = await this.tokenFetcher(installationId);
    const expiryDate = typeof expiresAt === 'string' ? new Date(expiresAt) : expiresAt;
    await this.cache.set(installationId, token, expiryDate);
    return token;
  }

  async getInstallationOctokit(installationId: number): Promise<Octokit> {
    const token = await this.getInstallationToken(installationId);
    return this.octokitFactory(token);
  }
}
