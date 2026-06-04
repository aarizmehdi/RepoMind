from sentence_transformers import SentenceTransformer
print("Loading model...")
model = SentenceTransformer("BAAI/bge-small-en-v1.5")
print("Model loaded. Encoding...")
vec = model.encode(["test sentence"])
print("Encoded successfully! Shape:", len(vec[0]))
