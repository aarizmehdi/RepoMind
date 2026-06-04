import { doc, setDoc, getDoc, collection, getDocs, updateDoc, serverTimestamp, increment } from "firebase/firestore";
import { db } from "./firebase";
import { Message } from "@/app/dashboard/page";

export interface SavedRepository {
  id: string; // the namespace (e.g., "owner/repo")
  url: string;
  name: string;
  indexedAt: Date;
}

/**
 * Saves a repository reference to the user's Firestore document.
 */
export async function saveRepository(
  userId: string,
  namespace: string,
  url: string,
  name: string
): Promise<void> {
  const repoRef = doc(db, "users", userId, "repositories", namespace.replace(/\//g, "_"));
  
  await setDoc(repoRef, {
    namespace,
    url,
    name,
    indexedAt: serverTimestamp(),
  }, { merge: true }); // Merge true so we don't overwrite if it exists
}

/**
 * Fetches all indexed repositories for the user.
 */
export async function getUserRepositories(userId: string): Promise<SavedRepository[]> {
  const reposRef = collection(db, "users", userId, "repositories");
  const snapshot = await getDocs(reposRef);
  
  const repos: SavedRepository[] = [];
  snapshot.forEach((docSnap) => {
    const data = docSnap.data();
    repos.push({
      id: data.namespace,
      url: data.url,
      name: data.name,
      // Handle the case where serverTimestamp hasn't resolved yet
      indexedAt: data.indexedAt?.toDate() || new Date(),
    });
  });
  
  // Sort by indexedAt descending
  return repos.sort((a, b) => b.indexedAt.getTime() - a.indexedAt.getTime());
}

/**
 * Saves the chat history for a specific repository namespace.
 */
export async function saveChatHistory(
  userId: string,
  namespace: string,
  messages: Message[]
): Promise<void> {
  // We sanitize the namespace to avoid slashes in document IDs
  const safeNamespace = namespace.replace(/\//g, "_");
  const chatRef = doc(db, "users", userId, "chats", safeNamespace);
  
  // Exclude streaming flag before saving
  const cleanMessages = messages.map(m => {
    const { streaming, ...rest } = m;
    return rest;
  });

  await setDoc(chatRef, {
    namespace,
    messages: cleanMessages,
    updatedAt: serverTimestamp(),
  });
}

/**
 * Loads the chat history for a specific repository namespace.
 */
export async function getChatHistory(
  userId: string,
  namespace: string
): Promise<Message[]> {
  const safeNamespace = namespace.replace(/\//g, "_");
  const chatRef = doc(db, "users", userId, "chats", safeNamespace);
  
  const snap = await getDoc(chatRef);
  if (snap.exists()) {
    return snap.data().messages as Message[];
  }
  return [];
}

/**
 * Retrieves the user's current limits. If the document doesn't exist, returns defaults.
 */
export async function getUserLimits(userId: string) {
  const userRef = doc(db, "users", userId);
  const snap = await getDoc(userRef);
  if (snap.exists()) {
    const data = snap.data();
    return {
      repos_indexed: data.repos_indexed || 0,
      total_messages: data.total_messages || 0,
      message_limit: data.message_limit || 5,
    };
  }
  return { repos_indexed: 0, total_messages: 0, message_limit: 5 };
}

/**
 * Safely updates a user's absolute usage limit.
 */
export async function updateUserLimit(
  userId: string,
  field: "message_limit",
  value: number
): Promise<void> {
  const userRef = doc(db, "users", userId);
  await setDoc(userRef, { [field]: value }, { merge: true });
}

/**
 * Safely increments a user's usage limit.
 */
export async function incrementUserLimit(
  userId: string,
  field: "repos_indexed" | "total_messages"
): Promise<void> {
  const userRef = doc(db, "users", userId);
  await setDoc(
    userRef,
    {
      [field]: increment(1),
    },
    { merge: true }
  );
}
