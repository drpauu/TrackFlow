import { getServerlessTrackFlowApp } from '../server/src/app.js';

export default async function handler(req, res) {
  const { app } = await getServerlessTrackFlowApp();
  return app(req, res);
}
