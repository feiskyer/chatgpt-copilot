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

let disableSSLVerification = false;

export function setDisableSSLVerification(value: boolean) {
    disableSSLVerification = value;
}

export async function fetchOpenAI(url: RequestInfo | URL, options?: RequestInit): Promise<Response> {
    if (!options?.body) {
        return fetch(url, options);
    }

    // Parse the request body
    const body = JSON.parse(options.body as string);

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
    const newOptions = {
        ...options,
        body: JSON.stringify(body)
    };

    console.log(
        `Body ${JSON.stringify(
            JSON.parse((newOptions?.body as string) || "{}"),
            null,
            2
        )}`);

    // Configure fetch to ignore SSL verification if disabled
    if (disableSSLVerification) {
        // @ts-ignore - Node.js specific options
        if (!newOptions.agent) {
            const https = require('https');
            // @ts-ignore - Node.js specific options
            newOptions.agent = new https.Agent({
                rejectUnauthorized: false
            });
        }
    }

    // Make the actual fetch call
    return fetch(url, newOptions);
}