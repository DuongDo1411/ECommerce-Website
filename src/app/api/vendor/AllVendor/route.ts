import connectDB from "@/lib/connectDB";
import User from "@/model/user.model";
import { NextResponse } from "next/server";

export async function GET() {
    try {
        await connectDB();
        const vendors = await User.find({role:"vendor"}).sort({createdAt: -1});
        if(!vendors){
            return NextResponse.json({message:"Vendors not found"},{status:400}); 
        }
        return NextResponse.json({vendors},{status:200});
    } catch (error) {
        return NextResponse.json({message:`get AllVendors error ${error}`},{status:500});
    }
}