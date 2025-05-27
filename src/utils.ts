/* eslint-disable eqeqeq */
/* eslint-disable @typescript-eslint/naming-convention */
/**
 * @author Pengfei Ni
 *
 * @license
 * Copyright (c) 2024 - Present, Pengfei Ni
 *
 * All rights reserved. Code licensed under the ISC license
 *
 * The above copyright notice and this permission notice shall be included in all
 * copies or substantial portions of the Software.
 */
import https from 'https';
import fetch from 'isomorphic-fetch';

export async function fetchOpenAI(url: RequestInfo | URL, options?: RequestInit, sslVerify: boolean = true): Promise<Response> {
    const effectiveOptions = { ...options };

    if (typeof window === 'undefined' && !sslVerify) {
        const agent = new https.Agent({
            rejectUnauthorized: false,
        });
        (effectiveOptions as any).agent = agent;
    }

    if (!effectiveOptions?.body) {
        return fetch(url, effectiveOptions);
    }

    // Parse the request body
    const body = JSON.parse(effectiveOptions.body as string);

    // Check if there are tools with functions
    if (body.tools?.length > 0) {
        body.tools = body.tools.map((tool: any) => {
            if (tool.type === 'function' && tool.function.strict) {
                // Remove the strict flag if present
                const { strict, ...functionWithoutStrict } = tool.function;
                return {
                    ...tool,
                    function: functionWithoutStrict
                };
            }
            return tool;
        });
    }

    // Create new options with modified body
    effectiveOptions.body = JSON.stringify(body);

    console.log(
        `Body ${JSON.stringify(
            JSON.parse((effectiveOptions?.body as string) || "{}"),
            null,
            2
        )}`);

    // Make the actual fetch call
    return fetch(url, effectiveOptions);
}