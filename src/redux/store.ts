import { configureStore } from '@reduxjs/toolkit'
import userSlice from './userSlice'
import vendorSlice from './vendorSlice'
import chatSlice from './chatSlice'


export const store = configureStore({
  reducer: {
    user:userSlice,
    vendor:vendorSlice,
    chat:chatSlice
  },
})


export type RootState = ReturnType<typeof store.getState>

export type AppDispatch = typeof store.dispatch
