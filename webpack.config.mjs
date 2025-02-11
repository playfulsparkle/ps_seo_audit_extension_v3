import WebExtPlugin from 'web-ext-plugin';

export default {
    plugins: [new WebExtPlugin({ sourceDir: 'dist' })],
};