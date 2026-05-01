import { auth } from "@/auth";
import connectDB from "@/lib/connectDB";
import User from "@/model/user.model";
import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
    try{
        await connectDB();
        const {shopName, shopAddress, taxNumber} = await req.json();
        const session = await auth();
        if(!session?.user?.email){
            return NextResponse.json({message: "Anauthorized access"}, {status: 401});
        }
        const user = await User.findOneAndUpdate({email:session?.user?.email},
            {
                shopName,
                shopAddress,
                taxNumber,
                verificationStatus: "pending",
                requestedAt: new Date()
            } , {new: true})
        if(!user){
            return NextResponse.json({message: "User is not found"}, {status: 400});
        }
        return NextResponse.json({message: "Vendor details submitted successfully" , user}, {status: 200});
    } catch (error) {
        return NextResponse.json({message: `Edit vendor details error ${error}`}, {status: 500});
    }
  
}