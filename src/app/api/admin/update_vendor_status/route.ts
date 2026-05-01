import { auth } from "@/auth";
import connectDB from "@/lib/connectDB";
import User from "@/model/user.model";
import { NextRequest, NextResponse } from "next/server";


export async function POST(req: NextRequest) {
    try {
        await connectDB();
        const session = await auth();
        const adminUser = await User.findById(session?.user?.id);

        if (!adminUser || adminUser.role !== "admin") {
            return NextResponse.json({
                message: "Only admin can approve vendors Or admin is not found"
            }, { status: 403 })
        }
        const {vendorId , status , rejectedReason} = await req.json()
        if(!vendorId || !status){
            return NextResponse.json(
                {message:"Vendor ID and status are required"},
                {status:400}
            ) 
        }
        
        const vendor = await User.findById(vendorId);
        if(status === "approved"){
            vendor.verificationStatus = "approved",
            vendor.isApproved = true,
            vendor.approvedAt = new Date(),
            vendor.rejectedReason = undefined 
        }

        if(status === "rejected"){
            vendor.verificationStatus = "rejected",
            vendor.isApproved = false,
            vendor.rejectedReason = rejectedReason || "Your application has been rejected by the admin. Please contact admin for more information"
        }

        await vendor.save();
        
        return NextResponse.json({message:"Vendor status updated successfully" , vendor},{status:200})

    } catch (error) {
        return NextResponse.json({message:`Vendor status update error ${error}`},{status:500})
    }
}