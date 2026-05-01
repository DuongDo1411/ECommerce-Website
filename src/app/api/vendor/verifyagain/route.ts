import { auth } from "@/auth";
import connectDB from "@/lib/connectDB";
import User from "@/model/user.model";
import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
    try{
        await connectDB();
        const {shopName, shopAddress, taxNumber} = await req.json();
        if(!shopName || !shopAddress || !taxNumber){
            return NextResponse.json({message: "All fields are required"}, {status: 400});
        }
        const session = await auth();
        if(!session?.user?.email){
            return NextResponse.json({message: "Unauthorized access"}, {status: 401});
        }
        const updatedVendor = await User.findOneAndUpdate({email:session?.user?.email},
            {
                shopName,
                shopAddress,
                taxNumber,
                verificationStatus: "pending",
                requestedAt: new Date(),
                rejectedReason: null,
                isApproved: false
            } , {new: true})
        if(!updatedVendor){
            return NextResponse.json({message: "Vendor is not found"}, {status: 404});
        }
        return NextResponse.json({message: "Verify again successfully", updatedVendor}, {status: 200});
    } catch (error) {
        return NextResponse.json({message: `Verify again error ${error}`}, {status: 500});
    }
}