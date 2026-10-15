/*
 * LOCAL PORT: single source of truth for where the archangel bridge lives.
 * The browser (geekom) and the bridge+MariaDB host (timsmini) are different
 * machines; geekom resolves marjis.com to timsmini. Loaded by the background
 * service worker only; content scripts receive the host via the synthesized
 * dsisServer (see BgFuncs.EnsureLocalDsis) and relay HTTP through the SW,
 * because a plain-http fetch from the https game page is blocked as mixed
 * content for any host other than 127.0.0.1.
 */
var BRIDGE_HOST = 'marjis.com:8010';
