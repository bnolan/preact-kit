import { useEffect, useState } from "preact/hooks";
import QuickLRU from "quick-lru";

// Gross singleton
declare global {
    var __API_ROUTES__: Map<string, any> | undefined;
}

export const apiRoutes =
    globalThis.__API_ROUTES__ ?? (globalThis.__API_ROUTES__ = new Map<string, any>());

export function addRoute(path: string, handler: any) {
    apiRoutes.set(path, handler);
}

const inflight = new Map<string, Promise<any>>();
// const fetchCache = new Map<string, any>();
const fetchCache = new QuickLRU({ maxSize: 32768, maxAge: 1000 });

export function useFetchState(url: string, defaultValue: any) {
    if (typeof window === "undefined") {
        if (inflight.has(url)) {
            throw inflight.get(url);
        }

        if (fetchCache.has(url)) {
            return useState(fetchCache.get(url));
        }

        if (!url.startsWith("/api/")) {
            throw new Error(`Route ${url} is not an /api/ route`);
        }

        const handler = apiRoutes.get(url);

        if (!handler) {
            throw new Error(`No route for ${url}`);
        }

        const f = async function () {
            let body: any;

            const mockReq = { method: "GET", url } as Request;
            const mockRes = {
                json(data: any) { body = data; return mockRes; },
                send(data: any) { body = data; return mockRes; },
                status() { return mockRes; },
            }

            // await new Promise(resolve => setTimeout(resolve, 5)); // force async
            await handler(mockReq, mockRes)
            const key = Object.keys(body)[0];
            const value = body[key]

            inflight.delete(url)
            fetchCache.set(url, value)

            return useState(value)
        }

        const promise = f()
        inflight.set(url, promise)
        throw promise;
    }

    const response = useState(defaultValue);
    const [value, setValue] = response;

    async function load() {
        const response = await fetch(url);
        const data = await response.json();
        const key = Object.keys(data)[0];

        setValue(data[key]);
    }

    useEffect(() => {
        load();
    }, []);

    return response;
}
