const HTML_TAG_RE = /<[^>]*>/g;
const HTML_SPACE_RE = /&nbsp;|&#160;/gi;
const WHITESPACE_RE = /\s+/g;

export const richTextToPlainText = (value: string | null | undefined): string => {
  return String(value || "")
    .replace(HTML_SPACE_RE, " ")
    .replace(HTML_TAG_RE, " ")
    .replace(WHITESPACE_RE, " ")
    .trim();
};

export const hasMeaningfulRichText = (value: string | null | undefined): boolean => {
  return richTextToPlainText(value).length > 0;
};
