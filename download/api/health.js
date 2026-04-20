module.exports = (req, res) => {
  res.status(200).json({
    ok: true,
    service: 'kestford-downloader',
    runtime: 'vercel-node',
    youtubeEnabled: false,
    time: new Date().toISOString()
  });
};
