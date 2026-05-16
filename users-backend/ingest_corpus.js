const fs = require('fs');
const path = require('path');
const axios = require('axios');
const { ChromaClient } = require('chromadb');

const OLLAMA_URL = process.env.OLLAMA_URL || 'http://localhost:11434';
const EMBED_MODEL = 'nomic-embed-text'; // Best open source embedding model

async function getEmbedding(text) {
    try {
        const response = await axios.post(`${OLLAMA_URL}/api/embeddings`, {
            model: EMBED_MODEL,
            prompt: text
        });
        return response.data.embedding;
    } catch (err) {
        console.error(`Failed to get embedding. Ensure '${EMBED_MODEL}' is pulled via 'ollama run ${EMBED_MODEL}'`);
        throw err;
    }
}

async function ingest() {
    console.log("==========================================");
    console.log("📚 STARTING CORPUS INGESTION TO CHROMADB");
    console.log("==========================================\n");

    const client = new ChromaClient({ path: "http://localhost:8000" });
    
    // Create or get the collection
    const collection = await client.getOrCreateCollection({
        name: "medical_guidelines",
        metadata: { "hnsw:space": "cosine" }
    });

    console.log("✅ Connected to ChromaDB Collection: medical_guidelines");

    // Read the markdown file
    const docPath = path.join(__dirname, 'medical_guidelines.md');
    const content = fs.readFileSync(docPath, 'utf8');

    // Structural chunking: split strictly at beginning of lines starting with '## '
    // This perfectly isolates each drug and vitals category as a single semantic unit
    const sections = content.split(/^## /m).filter(Boolean).map(c => '## ' + c.trim());
    
    let chunkCount = 0;
    
    for (const chunkTextRaw of sections) {
        let chunkText = chunkTextRaw;
        
        // Remove the footer text if it's the last chunk
        if (chunkText.includes("*End of CareMyMed RAG Corpus")) {
            chunkText = chunkText.split("*End of CareMyMed")[0].trim();
        }

        // We use the first line as the ID (e.g., "## Drug: Paracetamol")
        const firstLine = chunkText.split('\n')[0].trim();
        const chunkId = firstLine.replace(/[^a-zA-Z0-9-]/g, "_").toLowerCase();

        // Skip chunks that are just the main title (not a drug/vital section)
        if (!firstLine.includes("Drug:") && !firstLine.includes("Vitals:") && !firstLine.includes("General Drug Interaction Principles")) {
            continue;
        }

        console.log(`Embedding chunk: ${firstLine}...`);
        
        // Generate embedding
        const embedding = await getEmbedding(chunkText);
        
        // Add to Chroma
        await collection.upsert({
            ids: [chunkId],
            embeddings: [embedding],
            metadatas: [{ source: "caremymed_corpus_v1", title: firstLine }],
            documents: [chunkText]
        });

        chunkCount++;
    }

    console.log("\n==========================================");
    console.log(`✅ INGESTION COMPLETE: ${chunkCount} chunks added.`);
    console.log("==========================================");
}

ingest().catch(console.error);
