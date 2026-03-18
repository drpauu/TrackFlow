export default async function handler(req, res) {
  try {
    const { getServerlessTrackFlowApp } = await import('../server/src/app.js');
    const { app } = await getServerlessTrackFlowApp();
    return app(req, res);
  } catch (error) {
    console.error('Serverless init error:', error);
    res.status(500).json({
      error: 'Server init failed',
      message: error?.message || 'Unknown error',
      stack: error?.stack?.split('\n').slice(0, 10),
    });
  }
}
