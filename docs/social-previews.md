# Link previews

The initial `index.html` contains the branded title, description, Open Graph
and large-image Twitter card metadata. Crawlers do not need JavaScript, cookies,
or a GitHub session. All routes intentionally share public brand artwork; never
put private organization names, people or scores in unauthenticated previews.

`public/social/pull-prix-v1.svg` is the editable source, using the existing logo
and Jacarepagua circuit. Its PNG export is 1200 × 630 pixels. Export the SVG with
a renderer such as Sharp, preserving those dimensions. When changing the image,
version its filename and update both metadata image URLs to reduce stale caches.

`public/favicon.svg` uses the real logo on a dark square. PNG fallbacks, a 48px
PNG-backed favicon.ico, and a 180px Apple touch icon cover other consumers.
Regenerate these from the SVG when the mark changes.

There is deliberately no site-wide canonical/og:url pointing every route to the
homepage: shared team links must retain their destination. Route-specific
metadata would require server-rendered HTML, not a client-side head update.

Verify the deployed HTML and image responses for both the homepage and a team
deep link. Preview layout and cache refresh are ultimately controlled by the
messaging application; an already-cached message is not a reliable fresh check.

Metadata reference: https://ogp.me/
