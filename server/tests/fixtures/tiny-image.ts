/**
 * A real, decodable image for tests that post to /api/pipeline/run-stream.
 *
 * These suites used to send `data:image/jpeg;base64,AAAA` — four characters
 * standing in for a photo, which worked because nothing on the server looked
 * at the bytes: the route checked only that the field was truthy and handed
 * the string to Plant.id.
 *
 * pipeline/ingest/imageIngest now validates the upload, so a placeholder is
 * refused before the pipeline starts and the run emits an error instead of a
 * `complete` frame. That is the gate doing its job; the fixture was the thing
 * that was wrong.
 *
 * 32x32 so it clears MIN_IMAGE_EDGE (16), solid colour so it stays 275 bytes,
 * and a genuine JPEG so sharp both parses the header and decodes the pixel
 * data — the validator's two stages check different things, and a header-only
 * fake would pass one and fail the other.
 */
export const TINY_JPEG_BASE64 =
  '/9j/2wBDAAoHBwgHBgoICAgLCgoLDhgQDg0NDh0VFhEYIx8lJCIfIiEmKzcvJik0KSEiMEExNDk7Pj4+JS5ESUM8SDc9Pjv/2wBDAQoLCw4NDhwQEBw7KCIoOzs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozv/wAARCAAgACADASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAb/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFgEBAQEAAAAAAAAAAAAAAAAAAAMF/8QAFBEBAAAAAAAAAAAAAAAAAAAAAP/aAAwDAQACEQMRAD8AlAEGSAAAAAA//9k=';

/** The same bytes as a data URL, matching what the browser client sends. */
export const TINY_JPEG_DATA_URL = `data:image/jpeg;base64,${TINY_JPEG_BASE64}`;
