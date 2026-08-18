import createClient, { type Client as OpenapiClient, type ClientOptions } from 'openapi-fetch';
import type { paths } from './codegen/api';

const DEFAULT_BASE_URL = 'https://server.kivox.com.co';

type Client = OpenapiClient<paths>;

export type KivoxOptions = ClientOptions & {
    /** Defaults to `https://server.kivox.com.co` */
    baseUrl?: string;
};

/**
 * Type-safe client for the Kivox API.
 *
 * @example Bearer
 * ```ts
 * const kivox = new Kivox({
 *   headers: { Authorization: `Bearer ${token}` },
 * });
 * ```
 *
 * @example Session (browser)
 * ```ts
 * const kivox = new Kivox({
 *   credentials: "include",
 * });
 * ```
 */
export class Kivox {
    readonly client: Client;
    readonly GET: Client['GET'];
    readonly POST: Client['POST'];
    readonly PUT: Client['PUT'];
    readonly PATCH: Client['PATCH'];
    readonly DELETE: Client['DELETE'];
    readonly HEAD: Client['HEAD'];
    readonly OPTIONS: Client['OPTIONS'];
    readonly TRACE: Client['TRACE'];

    constructor(options: KivoxOptions = {}) {
        const { baseUrl = DEFAULT_BASE_URL, ...rest } = options;

        this.client = createClient<paths>({
            baseUrl,
            ...rest,
        });

        this.GET = this.client.GET.bind(this.client);
        this.POST = this.client.POST.bind(this.client);
        this.PUT = this.client.PUT.bind(this.client);
        this.PATCH = this.client.PATCH.bind(this.client);
        this.DELETE = this.client.DELETE.bind(this.client);
        this.HEAD = this.client.HEAD.bind(this.client);
        this.OPTIONS = this.client.OPTIONS.bind(this.client);
        this.TRACE = this.client.TRACE.bind(this.client);
    }

    /**
     * Update the Bearer token (no-op for session clients).
     * Useful when refreshing tokens without recreating the client.
     */
    setToken(token: string): void {
        this.client.use({
            onRequest({ request }) {
                request.headers.set('Authorization', `Bearer ${token}`);
                return request;
            },
        });
    }

    /**
     * Add a request/response middleware.
     * @see https://openapi-ts.dev/openapi-fetch/middleware-auth
     */
    use(...middleware: Parameters<Client['use']>): void {
        this.client.use(...middleware);
    }
}

export type { paths, components, operations } from './codegen/api';

export * from './schemas';
