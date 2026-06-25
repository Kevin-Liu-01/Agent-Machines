import type { Metadata } from "next";

import { SITE, TITLE_SEPARATOR } from "./config";

type PageMetadataInput = {
	title: string;
	description: string;
	path: string;
	keywords?: ReadonlyArray<string>;
	absoluteTitle?: boolean;
};

export const DEFAULT_OG_IMAGE = {
	url: SITE.ogImage,
	width: 1200,
	height: 630,
	alt: SITE.ogImageAlt,
	type: "image/png",
} as const;

export const DEFAULT_TWITTER_IMAGE = {
	url: SITE.ogImage,
	alt: SITE.ogImageAlt,
} as const;

export function buildPageMetadata({
	title,
	description,
	path,
	keywords = [],
	absoluteTitle = false,
}: PageMetadataInput): Metadata {
	const ogTitle = absoluteTitle
		? title
		: `${title}${TITLE_SEPARATOR}${SITE.name}`;
	return {
		title: absoluteTitle ? { absolute: title } : title,
		description,
		keywords: [...SITE.keywords, ...keywords],
		alternates: { canonical: path },
		openGraph: {
			title: ogTitle,
			description,
			url: path,
			siteName: SITE.name,
			type: "website",
			locale: "en_US",
			images: [DEFAULT_OG_IMAGE],
		},
		twitter: {
			card: "summary_large_image",
			site: SITE.twitterHandle,
			creator: SITE.twitterHandle,
			title: ogTitle,
			description,
			images: [DEFAULT_TWITTER_IMAGE],
		},
	};
}
