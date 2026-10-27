// `npm start` at the repo root injects ARENA_API_URL (ng serve --define) when port 3000 is taken.
declare const ARENA_API_URL: string | undefined;

export const API_BASE_URL = typeof ARENA_API_URL !== 'undefined' ? ARENA_API_URL : 'http://localhost:3000';
