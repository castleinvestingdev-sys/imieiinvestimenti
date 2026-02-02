-- Create PDF cache table for fast re-parsing
CREATE TABLE IF NOT EXISTS pdf_cache (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pdf_hash VARCHAR(64) UNIQUE NOT NULL, -- SHA-256 hash
  parsed_data JSONB NOT NULL,
  file_size_kb INTEGER,
  model_used VARCHAR(100),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '30 days'),
  hit_count INTEGER DEFAULT 0
);

-- Index for fast hash lookup
CREATE INDEX IF NOT EXISTS idx_pdf_cache_hash ON pdf_cache(pdf_hash);

-- Index for cleanup of expired entries
CREATE INDEX IF NOT EXISTS idx_pdf_cache_expires ON pdf_cache(expires_at);

-- Auto-cleanup expired entries (runs daily)
CREATE OR REPLACE FUNCTION cleanup_expired_pdf_cache()
RETURNS void AS $$
BEGIN
  DELETE FROM pdf_cache WHERE expires_at < NOW();
END;
$$ LANGUAGE plpgsql;

-- Increment hit counter for cache entry
CREATE OR REPLACE FUNCTION increment_cache_hit(cache_hash VARCHAR)
RETURNS void AS $$
BEGIN
  UPDATE pdf_cache
  SET hit_count = hit_count + 1
  WHERE pdf_hash = cache_hash;
END;
$$ LANGUAGE plpgsql;

-- Optional: Create scheduled job for cleanup (if pg_cron extension is available)
-- SELECT cron.schedule('cleanup-pdf-cache', '0 2 * * *', 'SELECT cleanup_expired_pdf_cache()');

COMMENT ON TABLE pdf_cache IS 'Cache for parsed PDF results to avoid re-parsing identical documents';
COMMENT ON COLUMN pdf_cache.pdf_hash IS 'SHA-256 hash of PDF file for uniqueness check';
COMMENT ON COLUMN pdf_cache.expires_at IS 'Cache entries expire after 30 days';
COMMENT ON COLUMN pdf_cache.hit_count IS 'Number of times this cached entry was reused';
