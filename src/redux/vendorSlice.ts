import { IUser } from "@/model/user.model";
import { createSlice } from "@reduxjs/toolkit";


interface IUserData {
    allVendorsData : IUser[]
}

const initialState : IUserData = {
    allVendorsData:[]
}

const vendorSlice = createSlice({
    name:"vendor",
    initialState,
    reducers:{
        setAllVendorData:(state,action)=>{
            state.allVendorsData = action.payload
        }
    }
})

export const {setAllVendorData} = vendorSlice.actions;
export default vendorSlice.reducer;