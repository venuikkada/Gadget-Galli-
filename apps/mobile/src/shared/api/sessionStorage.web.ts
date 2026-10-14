import AsyncStorage from '@react-native-async-storage/async-storage';

/** On the websites the session stays in the browser's own storage (see sessionStorage.ts for the phone apps). */
export const sessionStorage = AsyncStorage;
