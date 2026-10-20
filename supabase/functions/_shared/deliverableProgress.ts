// Shared by post and Story detection. Only successful links consume a promised piece.
export type PromisedContent = { kind: string; qty: number; done: boolean; items?: { status: string }[] };
const finished = (status: string) => status === 'published' || status === 'delivered';

export const postKind = (product: string, media: string) => product === 'STORY' ? 'Story'
  : product === 'REELS' ? 'Reel' : media === 'CAROUSEL_ALBUM' ? 'Carousel' : 'Static post';

export function remainingContent(groups: PromisedContent[], kind: string) {
  return groups.filter((d) => d.kind === kind).reduce((n, d) => n + (d.items?.length
    ? d.items.filter((x) => !finished(x.status)).length : d.done ? 0 : d.qty), 0);
}

export function consumeContent(groups: PromisedContent[], kind: string) {
  for (const d of groups.filter((x) => x.kind === kind)) {
    if (d.items?.length) {
      const next = d.items.find((x) => !finished(x.status));
      if (!next) continue;
      next.status = 'published';
      d.done = d.items.every((x) => finished(x.status));
    } else {
      if (d.done || d.qty < 1) continue;
      d.qty--;
      d.done = d.qty === 0;
    }
    return true;
  }
  return false;
}
