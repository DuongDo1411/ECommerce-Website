import connectDB from "@/lib/connectDB";
import { requireRole } from "@/lib/rbac";
import User from "@/model/user.model";
import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
    try{
        await connectDB();
        const {shopName, shopAddress, shopAddressDetail, taxNumber} = await req.json();
        const authz = await requireRole(["vendor"], { mode: "api" });
        if (authz instanceof NextResponse) return authz;
        const { session } = authz;
        // GHN requires structured pickup address (district id + ward code).
        if(!shopAddressDetail?.districtId || !shopAddressDetail?.wardCode){
            return NextResponse.json(
                {message: "Vui lòng chọn đầy đủ Tỉnh / Quận / Phường cho địa chỉ kho"},
                {status: 400},
            );
        }
        const user = await User.findOneAndUpdate({email:session?.user?.email},
            {
                shopName,
                shopAddress,
                shopAddressDetail,
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
