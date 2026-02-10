//! Chunk planning for file uploads.
//!
//! Splits files into logical shards (1 GiB each) and upload chunks (100 MiB each)
//! according to the gigafile.nu two-level chunking protocol.
//! Pure computation — no file I/O is performed.

use crate::models::upload::{Chunk, ChunkStatus, Shard, ShardStatus};

/// Logical shard size: 1 GiB.
pub const SHARD_SIZE: u64 = 1_073_741_824;
/// Upload chunk size: 100 MiB.
pub const CHUNK_SIZE: u64 = 104_857_600;

/// Plan shard and chunk layout for a file of the given size.
///
/// Pure computation function — no file I/O. Returned shards have empty `upload_id`,
/// `Pending` status, and `None` download_url. The upstream upload_engine fills these
/// in when the upload session starts.
pub fn plan_chunks(file_size: u64) -> Vec<Shard> {
    if file_size == 0 {
        return Vec::new();
    }

    let mut shards = Vec::new();
    let mut file_offset: u64 = 0;
    let mut shard_index: u32 = 0;

    while file_offset < file_size {
        let shard_size = std::cmp::min(SHARD_SIZE, file_size - file_offset);
        let chunks = plan_shard_chunks(file_offset, shard_size);

        shards.push(Shard {
            shard_index,
            offset: file_offset,
            size: shard_size,
            chunks,
            upload_id: String::new(),
            status: ShardStatus::Pending,
            download_url: None,
        });

        file_offset += shard_size;
        shard_index += 1;
    }

    shards
}

/// Plan chunk layout within a single shard.
fn plan_shard_chunks(shard_file_offset: u64, shard_size: u64) -> Vec<Chunk> {
    let mut chunks = Vec::new();
    let mut chunk_offset: u64 = 0;
    let mut chunk_index: u32 = 0;

    while chunk_offset < shard_size {
        let chunk_size = std::cmp::min(CHUNK_SIZE, shard_size - chunk_offset);
        chunks.push(Chunk {
            chunk_index,
            offset: shard_file_offset + chunk_offset,
            size: chunk_size,
            status: ChunkStatus::Pending,
        });
        chunk_offset += chunk_size;
        chunk_index += 1;
    }

    chunks
}

#[cfg(test)]
mod tests {
    use super::*;

    // AC-5: 50 MiB — 1 shard, 1 chunk
    #[test]
    fn test_small_file_50mib() {
        let file_size: u64 = 52_428_800;
        let shards = plan_chunks(file_size);
        assert_eq!(shards.len(), 1);

        let shard = &shards[0];
        assert_eq!(shard.shard_index, 0);
        assert_eq!(shard.offset, 0);
        assert_eq!(shard.size, file_size);
        assert_eq!(shard.chunks.len(), 1);
        assert_eq!(shard.chunks[0].chunk_index, 0);
        assert_eq!(shard.chunks[0].offset, 0);
        assert_eq!(shard.chunks[0].size, file_size);
    }

    // AC-5: 350 MiB — 1 shard, 4 chunks (3 full + 1 tail)
    #[test]
    fn test_medium_file_350mib() {
        let file_size: u64 = 367_001_600;
        let shards = plan_chunks(file_size);
        assert_eq!(shards.len(), 1);

        let shard = &shards[0];
        assert_eq!(shard.chunks.len(), 4);

        // First 3 chunks are full 100 MiB
        for i in 0..3 {
            assert_eq!(shard.chunks[i].size, CHUNK_SIZE);
        }
        // Tail chunk: 367_001_600 - 3 * 104_857_600 = 52_428_800
        assert_eq!(shard.chunks[3].size, 52_428_800);

        // Sum of chunk sizes equals file size
        let total: u64 = shard.chunks.iter().map(|c| c.size).sum();
        assert_eq!(total, file_size);
    }

    // AC-5: 2.5 GiB — 3 shards
    #[test]
    fn test_large_file_2_5gib() {
        let file_size: u64 = 2_684_354_560;
        let shards = plan_chunks(file_size);
        assert_eq!(shards.len(), 3);

        // Shard 0: 1 GiB = 11 chunks (10 x 100MiB + 1 x 25_165_824)
        assert_eq!(shards[0].size, SHARD_SIZE);
        assert_eq!(shards[0].chunks.len(), 11);
        let shard0_total: u64 = shards[0].chunks.iter().map(|c| c.size).sum();
        assert_eq!(shard0_total, SHARD_SIZE);

        // Shard 1: 1 GiB = 11 chunks
        assert_eq!(shards[1].size, SHARD_SIZE);
        assert_eq!(shards[1].chunks.len(), 11);
        let shard1_total: u64 = shards[1].chunks.iter().map(|c| c.size).sum();
        assert_eq!(shard1_total, SHARD_SIZE);

        // Shard 2: 0.5 GiB = 536_870_912 bytes = 6 chunks (5 x 100MiB + 1 tail)
        let last_shard_size = file_size - 2 * SHARD_SIZE;
        assert_eq!(shards[2].size, last_shard_size);
        assert_eq!(shards[2].chunks.len(), 6);
        let shard2_total: u64 = shards[2].chunks.iter().map(|c| c.size).sum();
        assert_eq!(shard2_total, last_shard_size);

        // Total of all shards equals file size
        let total: u64 = shards.iter().map(|s| s.size).sum();
        assert_eq!(total, file_size);
    }

    // AC-5: exactly 100 MiB — 1 shard, 1 chunk
    #[test]
    fn test_exactly_100mib() {
        let file_size: u64 = 104_857_600;
        let shards = plan_chunks(file_size);
        assert_eq!(shards.len(), 1);
        assert_eq!(shards[0].chunks.len(), 1);
        assert_eq!(shards[0].chunks[0].size, CHUNK_SIZE);
    }

    // AC-5: exactly 1 GiB — 1 shard, 11 chunks
    #[test]
    fn test_exactly_1gib() {
        let file_size: u64 = 1_073_741_824;
        let shards = plan_chunks(file_size);
        assert_eq!(shards.len(), 1);
        assert_eq!(shards[0].chunks.len(), 11);

        // 10 full chunks + 1 tail
        for i in 0..10 {
            assert_eq!(shards[0].chunks[i].size, CHUNK_SIZE);
        }
        // Tail: 1_073_741_824 - 10 * 104_857_600 = 25_165_824
        assert_eq!(shards[0].chunks[10].size, 25_165_824);

        let total: u64 = shards[0].chunks.iter().map(|c| c.size).sum();
        assert_eq!(total, file_size);
    }

    // AC-5: 1 GiB + 1 byte — 2 shards
    #[test]
    fn test_1gib_plus_1_byte() {
        let file_size: u64 = 1_073_741_825;
        let shards = plan_chunks(file_size);
        assert_eq!(shards.len(), 2);

        assert_eq!(shards[0].shard_index, 0);
        assert_eq!(shards[0].size, SHARD_SIZE);

        assert_eq!(shards[1].shard_index, 1);
        assert_eq!(shards[1].size, 1);
        assert_eq!(shards[1].chunks.len(), 1);
        assert_eq!(shards[1].chunks[0].size, 1);
        assert_eq!(shards[1].chunks[0].offset, SHARD_SIZE);
    }

    // AC-5: 1 byte
    #[test]
    fn test_1_byte() {
        let shards = plan_chunks(1);
        assert_eq!(shards.len(), 1);
        assert_eq!(shards[0].size, 1);
        assert_eq!(shards[0].chunks.len(), 1);
        assert_eq!(shards[0].chunks[0].size, 1);
        assert_eq!(shards[0].chunks[0].offset, 0);
    }

    // AC-5: 0 bytes — empty Vec
    #[test]
    fn test_0_bytes() {
        let shards = plan_chunks(0);
        assert!(shards.is_empty());
    }

    // AC-5: offset continuity — no gaps, no overlaps
    #[test]
    fn test_offset_continuity() {
        // Test with multiple file sizes
        let sizes: Vec<u64> = vec![
            1,
            52_428_800,
            104_857_600,
            367_001_600,
            1_073_741_824,
            1_073_741_825,
            2_684_354_560,
        ];

        for file_size in sizes {
            let shards = plan_chunks(file_size);

            // Collect all chunks across all shards, sorted by offset
            let mut all_chunks: Vec<(u64, u64)> = Vec::new();
            for shard in &shards {
                for chunk in &shard.chunks {
                    all_chunks.push((chunk.offset, chunk.size));
                }
            }
            all_chunks.sort_by_key(|&(offset, _)| offset);

            // Verify contiguous coverage of [0, file_size)
            assert_eq!(
                all_chunks[0].0, 0,
                "First chunk must start at offset 0 for file_size={}",
                file_size
            );

            let mut expected_offset = 0u64;
            for (offset, size) in &all_chunks {
                assert_eq!(
                    *offset, expected_offset,
                    "Gap or overlap at offset {} (expected {}) for file_size={}",
                    offset, expected_offset, file_size
                );
                expected_offset += size;
            }
            assert_eq!(
                expected_offset, file_size,
                "Chunks don't cover full file for file_size={}",
                file_size
            );
        }
    }

    // AC-4: all statuses Pending, upload_id empty
    #[test]
    fn test_all_status_pending_and_upload_id_empty() {
        let shards = plan_chunks(2_684_354_560);
        for shard in &shards {
            assert_eq!(shard.status, ShardStatus::Pending);
            assert_eq!(shard.upload_id, "");
            assert!(shard.download_url.is_none());
            for chunk in &shard.chunks {
                assert_eq!(chunk.status, ChunkStatus::Pending);
            }
        }
    }
}
