export type FrameButtonAction = 'link' | 'tx' | 'post';
export type FrameButton = { action: FrameButtonAction; label: string; target: string };
export interface FrameOptions {
    buttons: FrameButton[];
    image: { src: string };
    postUrl: string;
    inputText?: string; // Optional text_input placeholder
}

export function getFrameHtmlResponse(opts: FrameOptions): string {
    const buttonsHtml = opts.buttons.map((b, i) => `
        <meta property="fc:frame:button:${i + 1}" content="${b.label}" />
        <meta property="fc:frame:button:${i + 1}:action" content="${b.action}" />
        <meta property="fc:frame:button:${i + 1}:target" content="${b.target}" />
    `).join('\n');

    const inputHtml = opts.inputText
        ? `<meta property="fc:frame:input:text" content="${opts.inputText}" />`
        : '';

    return `<!DOCTYPE html><html><head>
        <meta property="og:title" content="Droppit Frame" />
        <meta property="og:image" content="${opts.image.src}" />
        <meta property="fc:frame" content="vNext" />
        <meta property="fc:frame:image" content="${opts.image.src}" />
        <meta property="fc:frame:post_url" content="${opts.postUrl}" />
        ${inputHtml}
        ${buttonsHtml}
    </head></html>`;
}
